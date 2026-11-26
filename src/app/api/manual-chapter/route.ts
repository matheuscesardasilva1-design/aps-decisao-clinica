import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

    // Busca todas as páginas do mesmo capítulo (ou janela de páginas vizinhas se capítulo estiver vazio)
    let pages:
      | {
          numero_pagina: number;
          capitulo_tema: string;
          subtitulo_pagina: string;
          possui_fluxograma: boolean;
          possui_receita_modelo: boolean;
        }[]
      | null = null;

    if (capitulo.length >= 3) {
      const { data } = await supabase
        .from("manual_paginas")
        .select(
          "numero_pagina, capitulo_tema, subtitulo_pagina, possui_fluxograma, possui_receita_modelo"
        )
        .eq("manual_id", manualId)
        .ilike("capitulo_tema", `%${capitulo.slice(0, 40)}%`)
        .order("numero_pagina", { ascending: true })
        .limit(20);
      pages = data;
    }

    if (!pages || pages.length <= 1) {
      const { data } = await supabase
        .from("manual_paginas")
        .select(
          "numero_pagina, capitulo_tema, subtitulo_pagina, possui_fluxograma, possui_receita_modelo"
        )
        .eq("manual_id", manualId)
        .gte("numero_pagina", Math.max(1, currentPage - 3))
        .lte("numero_pagina", currentPage + 5)
        .order("numero_pagina", { ascending: true });
      pages = data || [];
    }

    return NextResponse.json({ pages });
  } catch (err) {
    console.error("[manual-chapter] Erro:", err);
    return NextResponse.json({ pages: [] });
  }
}
