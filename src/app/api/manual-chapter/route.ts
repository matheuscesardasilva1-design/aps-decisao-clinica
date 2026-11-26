import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getClinicalTopicKey,
  isNonClinicalFrontMatter,
} from "@/lib/topic-grouping";

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
    const capitulo = request.nextUrl.searchParams.get("capitulo")?.trim() || "";
    const currentPage = Number(request.nextUrl.searchParams.get("page")) || 1;

    if (!manualId) {
      return NextResponse.json({ error: "manualId obrigatório." }, { status: 400 });
    }

    const { data: allManualPages, error } = await supabase
      .from("manual_paginas")
      .select(
        "id, numero_pagina, imagem_webp_path, capitulo_tema, subtitulo_pagina, palavras_chave_clinicas, possui_fluxograma, possui_receita_modelo, texto_receita_verbatim, texto_indexacao"
      )
      .eq("manual_id", manualId)
      .order("numero_pagina", { ascending: true });

    if (error || !allManualPages) {
      return NextResponse.json({ pages: [] });
    }

    const targetKey = getClinicalTopicKey(manualId, capitulo);

    let chapterPages = allManualPages.filter(
      (p) =>
        !isNonClinicalFrontMatter(p.capitulo_tema, p.subtitulo_pagina) &&
        getClinicalTopicKey(manualId, p.capitulo_tema || "") === targetKey
    );

    if (chapterPages.length === 0) {
      chapterPages = allManualPages.filter(
        (p) => p.numero_pagina === currentPage
      );
    }

    return NextResponse.json({ pages: chapterPages.slice(0, 25) });
  } catch (err) {
    console.error("[manual-chapter] Erro:", err);
    return NextResponse.json({ pages: [] });
  }
}
