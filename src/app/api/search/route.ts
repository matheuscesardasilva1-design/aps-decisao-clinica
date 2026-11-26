import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { embedClinicalText } from "@/lib/gemini";
import {
  getCleanTopicDisplayTitle,
  getClinicalTopicKey,
  isNonClinicalFrontMatter,
} from "@/lib/topic-grouping";
import type { FilterPillKey, SearchResultItem } from "@/types/clinical";

const ALLOWED_FILTERS: FilterPillKey[] = [
  "todos",
  "Adulto APS",
  "Obstetrícia / Pré-Natal",
  "TelessaúdeRS",
  "novidades",
  "receita",
];

function groupManualTopics(rawResults: SearchResultItem[]): SearchResultItem[] {
  const grouped: SearchResultItem[] = [];
  const topicIndexMap = new Map<
    string,
    {
      index: number;
      pages: Set<number>;
      keywords: Set<string>;
      subtitles: Set<string>;
    }
  >();

  for (const item of rawResults) {
    if (item.tipo_fonte !== "manual_pagina" || !item.manual_id) {
      grouped.push(item);
      continue;
    }

    // Remove capas, sumários, aviso ético e referências da lista clínica
    if (isNonClinicalFrontMatter(item.titulo, item.subtitulo)) {
      continue;
    }

    const key = getClinicalTopicKey(item.manual_id, item.titulo || "");
    const existing = topicIndexMap.get(key);

    if (!existing) {
      const pages = new Set<number>();
      if (item.numero_pagina) pages.add(item.numero_pagina);

      const keywords = new Set<string>(item.palavras_chave || []);
      const subtitles = new Set<string>();
      if (item.subtitulo) subtitles.add(item.subtitulo);

      const cleanTitle = getCleanTopicDisplayTitle(item.titulo || "");
      const idx = grouped.length;
      grouped.push({
        ...item,
        titulo: cleanTitle,
        chapter_page_count: pages.size,
        chapter_page_range: item.numero_pagina ? `Pág. ${item.numero_pagina}` : "",
        fonte_label: `${item.categoria} • ${item.numero_pagina ? `Pág. ${item.numero_pagina}` : ""}`,
      });
      topicIndexMap.set(key, { index: idx, pages, keywords, subtitles });
    } else {
      const target = grouped[existing.index];
      if (item.numero_pagina) existing.pages.add(item.numero_pagina);
      (item.palavras_chave || []).forEach((k) => existing.keywords.add(k));
      if (item.subtitulo) existing.subtitles.add(item.subtitulo);

      target.possui_fluxograma = target.possui_fluxograma || item.possui_fluxograma;
      target.possui_receita_modelo =
        target.possui_receita_modelo || item.possui_receita_modelo;
      if (!target.texto_receita_verbatim && item.texto_receita_verbatim) {
        target.texto_receita_verbatim = item.texto_receita_verbatim;
      }
      target.palavras_chave = Array.from(existing.keywords).slice(0, 12);

      const sortedPages = Array.from(existing.pages).sort((a, b) => a - b);
      const minP = sortedPages[0];
      const maxP = sortedPages[sortedPages.length - 1];
      const range =
        sortedPages.length > 1 ? `Págs. ${minP}–${maxP}` : `Pág. ${minP}`;

      target.chapter_page_count = sortedPages.length;
      target.chapter_page_range = range;
      target.fonte_label = `${target.categoria} • ${range}`;
      target.subtitulo = Array.from(existing.subtitles).slice(0, 2).join(" • ");
    }
  }

  return grouped;
}

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
    const requestedLimit = Math.min(Math.max(Number(body.limit) || 25, 1), 50);

    let queryEmbedding: string | null = null;
    let semanticActive = false;

    if (queryText.length >= 2) {
      try {
        const vector = await embedClinicalText(queryText);
        queryEmbedding = `[${vector.join(",")}]`;
        semanticActive = true;
      } catch (err) {
        console.warn("[search] Embedding indisponível, usando FTS:", err);
      }
    }

    const { data, error } = await supabase.rpc("buscar_conhecimento_clinico_v2", {
      query_text: queryText,
      query_embedding: queryEmbedding,
      filtro_categoria: filter,
      incluir_arquivados: includeArchived,
      match_count: 50,
    });

    if (error) {
      console.error("[search] Erro RPC:", error);
      return NextResponse.json(
        { error: "Erro ao executar busca clínica no banco de dados." },
        { status: 500 }
      );
    }

    const rawResults = (data || []) as SearchResultItem[];
    const results = groupManualTopics(rawResults).slice(0, requestedLimit);

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
