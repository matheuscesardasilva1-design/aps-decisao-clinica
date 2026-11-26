import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function normalizeStem(text: string): string {
  const clean = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  const words = clean.split(" ").filter((w) => w.length > 2);
  return words.slice(0, 2).join(" ") || clean;
}

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

    const targetStem = normalizeStem(capitulo);

    let chapterPages = targetStem
      ? allManualPages.filter(
          (p) => normalizeStem(p.capitulo_tema || "") === targetStem
        )
      : [];

    if (chapterPages.length === 0) {
      chapterPages = allManualPages.filter(
        (p) =>
          p.numero_pagina >= Math.max(1, currentPage - 2) &&
          p.numero_pagina <= currentPage + 3
      );
    }

    return NextResponse.json({ pages: chapterPages.slice(0, 25) });
  } catch (err) {
    console.error("[manual-chapter] Erro:", err);
    return NextResponse.json({ pages: [] });
  }
}
