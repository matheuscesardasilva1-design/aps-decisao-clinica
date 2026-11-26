import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { embedClinicalText } from "@/lib/gemini";
import type { FilterPillKey, SearchResultItem } from "@/types/clinical";

const ALLOWED_FILTERS: FilterPillKey[] = [
  "todos",
  "Adulto APS",
  "Obstetrícia / Pré-Natal",
  "TelessaúdeRS",
  "novidades",
  "receita",
];

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
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
      query?: string;
      filter?: string;
      includeArchived?: boolean;
      limit?: number;
    };

    const queryText = (body.query || "").trim();
    const filter: FilterPillKey = ALLOWED_FILTERS.includes(body.filter as FilterPillKey)
      ? (body.filter as FilterPillKey)
      : "todos";
    const includeArchived = Boolean(body.includeArchived);
    const limit = Math.min(Math.max(Number(body.limit) || 25, 1), 50);

    let queryEmbedding: string | null = null;
    let semanticActive = false;

    if (queryText.length >= 2) {
      try {
        const vector = await embedClinicalText(queryText);
        queryEmbedding = `[${vector.join(",")}]`;
        semanticActive = true;
      } catch (err) {
        // Fallback gracioso para FTS puro se a API de embedding oscilar
        console.warn("[search] Embedding indisponível, usando FTS:", err);
      }
    }

    const { data, error } = await supabase.rpc("buscar_conhecimento_clinico", {
      query_text: queryText,
      query_embedding: queryEmbedding,
      filtro_categoria: filter,
      incluir_arquivados: includeArchived,
      match_count: limit,
    });

    if (error) {
      console.error("[search] Erro RPC:", error);
      return NextResponse.json(
        { error: "Erro ao executar busca clínica no banco de dados." },
        { status: 500 }
      );
    }

    const results = (data || []) as SearchResultItem[];

    return NextResponse.json({
      results,
      meta: {
        count: results.length,
        elapsedMs: Date.now() - startedAt,
        semanticActive,
      },
    });
  } catch (err) {
    console.error("[search] Erro inesperado:", err);
    return NextResponse.json(
      { error: "Erro interno ao processar a busca." },
      { status: 500 }
    );
  }
}
