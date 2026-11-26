import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { embedClinicalText, indexPdfPageImage } from "@/lib/gemini";

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      manualId?: string;
      manualTitulo?: string;
      manualCategoria?: string;
      pageNumber?: number;
      webpBase64?: string;
    };

    const { manualId, manualTitulo, manualCategoria, pageNumber, webpBase64 } = body;

    if (!manualId || !pageNumber || !webpBase64) {
      return NextResponse.json(
        { error: "manualId, pageNumber e webpBase64 são obrigatórios." },
        { status: 400 }
      );
    }

    const cleanBase64 = webpBase64.replace(/^data:image\/webp;base64,/, "");
    const buffer = Buffer.from(cleanBase64, "base64");
    const padded = String(pageNumber).padStart(4, "0");
    const webpPath = `${manualId}/pagina_${padded}.webp`;

    const { error: uploadError } = await supabase.storage
      .from("paginas-webp")
      .upload(webpPath, buffer, {
        contentType: "image/webp",
        upsert: true,
      });

    if (uploadError) {
      console.error("[admin/index-page] Erro upload Storage:", uploadError);
      return NextResponse.json(
        { error: "Falha ao salvar imagem WebP no bucket privado." },
        { status: 500 }
      );
    }

    const meta = await indexPdfPageImage(cleanBase64);

    const embeddingSource = [
      `Manual: ${manualTitulo || ""} (${manualCategoria || ""})`,
      `Capítulo: ${meta.capitulo_tema}`,
      `Subtítulo: ${meta.subtitulo_pagina}`,
      `Palavras-chave: ${meta.palavras_chave_clinicas.join(", ")}`,
      `Conteúdo: ${meta.texto_indexacao}`,
      meta.texto_receita_verbatim ? `Receita: ${meta.texto_receita_verbatim}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const embedding = await embedClinicalText(embeddingSource);

    const { error: upsertError } = await supabase.from("manual_paginas").upsert(
      {
        manual_id: manualId,
        numero_pagina: pageNumber,
        imagem_webp_path: webpPath,
        capitulo_tema: meta.capitulo_tema,
        subtitulo_pagina: meta.subtitulo_pagina,
        palavras_chave_clinicas: meta.palavras_chave_clinicas,
        possui_fluxograma: meta.possui_fluxograma,
        possui_receita_modelo: meta.possui_receita_modelo,
        texto_receita_verbatim: meta.texto_receita_verbatim,
        texto_indexacao: meta.texto_indexacao,
        embedding: `[${embedding.join(",")}]`,
      },
      { onConflict: "manual_id,numero_pagina" }
    );

    if (upsertError) {
      console.error("[admin/index-page] Erro upsert página:", upsertError);
      return NextResponse.json(
        { error: "Falha ao salvar metadados da página no banco." },
        { status: 500 }
      );
    }

    const { count } = await supabase
      .from("manual_paginas")
      .select("id", { count: "exact", head: true })
      .eq("manual_id", manualId);

    await supabase
      .from("manuais")
      .update({ paginas_indexadas: count ?? pageNumber })
      .eq("id", manualId);

    return NextResponse.json({
      ok: true,
      pageNumber,
      capitulo_tema: meta.capitulo_tema,
      possui_fluxograma: meta.possui_fluxograma,
      possui_receita_modelo: meta.possui_receita_modelo,
      paginas_indexadas: count ?? pageNumber,
    });
  } catch (err) {
    console.error("[admin/index-page] Erro:", err);
    return NextResponse.json(
      { error: "Erro ao indexar página com Gemini." },
      { status: 500 }
    );
  }
}
