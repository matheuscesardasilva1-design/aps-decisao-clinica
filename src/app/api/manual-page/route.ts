import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { SearchResultItem } from "@/types/clinical";

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const manualId = request.nextUrl.searchParams.get("manualId")?.trim();
    const pageNum = Number(request.nextUrl.searchParams.get("page"));

    if (!manualId || !Number.isInteger(pageNum) || pageNum < 1) {
      return NextResponse.json(
        { error: "Parâmetros manualId e page são obrigatórios." },
        { status: 400 }
      );
    }

    const { data: pageRow, error: pageError } = await supabase
      .from("manual_paginas")
      .select(
        `
        id,
        manual_id,
        numero_pagina,
        imagem_webp_path,
        capitulo_tema,
        subtitulo_pagina,
        palavras_chave_clinicas,
        possui_fluxograma,
        possui_receita_modelo,
        texto_receita_verbatim,
        texto_indexacao,
        manuais!inner (
          titulo,
          categoria,
          versao,
          total_paginas,
          arquivado
        )
      `
      )
      .eq("manual_id", manualId)
      .eq("numero_pagina", pageNum)
      .maybeSingle();

    if (pageError || !pageRow) {
      return NextResponse.json(
        { error: "Página não encontrada neste manual." },
        { status: 404 }
      );
    }

    const manual = Array.isArray(pageRow.manuais) ? pageRow.manuais[0] : pageRow.manuais;

    const item: SearchResultItem = {
      id: pageRow.id,
      tipo_fonte: "manual_pagina",
      titulo: pageRow.capitulo_tema || manual.titulo,
      subtitulo: pageRow.subtitulo_pagina || `Página ${pageRow.numero_pagina}`,
      categoria: manual.categoria,
      fonte_label: `${manual.titulo} ${manual.versao} • Pág. ${pageRow.numero_pagina}`,
      palavras_chave: pageRow.palavras_chave_clinicas || [],
      score: 1,
      manual_id: pageRow.manual_id,
      manual_titulo: manual.titulo,
      manual_versao: manual.versao,
      manual_total_paginas: manual.total_paginas,
      manual_arquivado: manual.arquivado,
      numero_pagina: pageRow.numero_pagina,
      imagem_webp_path: pageRow.imagem_webp_path,
      possui_fluxograma: Boolean(pageRow.possui_fluxograma),
      possui_receita_modelo: Boolean(pageRow.possui_receita_modelo),
      texto_receita_verbatim: pageRow.texto_receita_verbatim,
      texto_indexacao: pageRow.texto_indexacao,
      url_original: null,
      data_publicacao: null,
      especialidade: null,
      resposta_direta: null,
      texto_completo: null,
      conteudo_html: null,
      conduta_direta: null,
      prescricao_exames: null,
      quando_encaminhar: null,
      referencias: null,
      is_new: false,
    };

    return NextResponse.json({ item });
  } catch (err) {
    console.error("[manual-page] Erro:", err);
    return NextResponse.json({ error: "Erro ao buscar página do manual." }, { status: 500 });
  }
}
