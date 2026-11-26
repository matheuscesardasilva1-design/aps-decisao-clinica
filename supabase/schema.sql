-- ==============================================================================
-- APS Decisão Clínica — Schema Completo do Banco de Dados (Supabase / PostgreSQL)
-- Execute este script no SQL Editor do Supabase Dashboard.
-- ==============================================================================

-- 1. EXTENSÕES NECESSÁRIAS
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Wrapper IMMUTABLE para unaccent() — necessário para colunas GENERATED tsvector e índices
CREATE OR REPLACE FUNCTION public.f_unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE PARALLEL SAFE STRICT
AS $$
  SELECT public.unaccent('public.unaccent', $1);
$$;

-- Trigger helper para manter updated_at atualizado
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ==============================================================================
-- 2. TABELAS PRINCIPAIS
-- ==============================================================================

-- 2.1 Manuais Clínicos e Protocolos (metadados e controle de versão)
CREATE TABLE IF NOT EXISTS public.manuais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  categoria text NOT NULL CHECK (
    categoria IN (
      'Adulto APS',
      'Obstetrícia / Pré-Natal',
      'REMUME',
      'Protocolos'
    )
  ),
  versao text NOT NULL,
  pdf_storage_path text,
  total_paginas integer NOT NULL DEFAULT 0,
  paginas_indexadas integer NOT NULL DEFAULT 0,
  arquivado boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT manuais_titulo_versao_unique UNIQUE (titulo, versao)
);

DROP TRIGGER IF EXISTS trg_manuais_updated_at ON public.manuais;
CREATE TRIGGER trg_manuais_updated_at
  BEFORE UPDATE ON public.manuais
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 2.2 Páginas Indexadas dos Manuais (1 registro por página renderizada em WebP)
CREATE TABLE IF NOT EXISTS public.manual_paginas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manual_id uuid NOT NULL REFERENCES public.manuais(id) ON DELETE CASCADE,
  numero_pagina integer NOT NULL CHECK (numero_pagina > 0),
  imagem_webp_path text NOT NULL,
  capitulo_tema text NOT NULL DEFAULT '',
  subtitulo_pagina text NOT NULL DEFAULT '',
  palavras_chave_clinicas text[] NOT NULL DEFAULT '{}',
  possui_fluxograma boolean NOT NULL DEFAULT false,
  possui_receita_modelo boolean NOT NULL DEFAULT false,
  texto_receita_verbatim text,
  texto_indexacao text NOT NULL DEFAULT '',
  fts tsvector GENERATED ALWAYS AS (
    to_tsvector(
      'portuguese',
      public.f_unaccent(
        coalesce(capitulo_tema, '') || ' ' ||
        coalesce(subtitulo_pagina, '') || ' ' ||
        coalesce(texto_indexacao, '') || ' ' ||
        coalesce(texto_receita_verbatim, '')
      )
    )
  ) STORED,
  embedding vector(768),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT manual_paginas_unique_page UNIQUE (manual_id, numero_pagina)
);

-- 2.3 Perguntas da Semana — TelessaúdeRS-UFRGS
CREATE TABLE IF NOT EXISTS public.perguntas_telessaude (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url_original text NOT NULL UNIQUE,
  titulo_pergunta text NOT NULL,
  data_publicacao date,
  especialidade text NOT NULL DEFAULT 'Atenção Primária',
  resposta_direta text NOT NULL DEFAULT '',
  texto_completo text NOT NULL DEFAULT '',
  conduta_direta text[] NOT NULL DEFAULT '{}',
  prescricao_exames text[] NOT NULL DEFAULT '{}',
  quando_encaminhar text[] NOT NULL DEFAULT '{}',
  referencias text NOT NULL DEFAULT '',
  palavras_chave text[] NOT NULL DEFAULT '{}',
  is_new boolean NOT NULL DEFAULT true,
  fts tsvector GENERATED ALWAYS AS (
    to_tsvector(
      'portuguese',
      public.f_unaccent(
        coalesce(titulo_pergunta, '') || ' ' ||
        coalesce(especialidade, '') || ' ' ||
        coalesce(resposta_direta, '') || ' ' ||
        coalesce(texto_completo, '')
      )
    )
  ) STORED,
  embedding vector(768),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2.4 Logs de Sincronização (TelessaúdeRS e Ingestões)
CREATE TABLE IF NOT EXISTS public.sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fonte text NOT NULL DEFAULT 'telessaude_rs',
  status text NOT NULL CHECK (status IN ('sucesso', 'parcial', 'erro')),
  novas_perguntas integer NOT NULL DEFAULT 0,
  total_verificadas integer NOT NULL DEFAULT 0,
  mensagem text,
  detalhes_erro jsonb,
  executado_em timestamptz NOT NULL DEFAULT now()
);

-- ==============================================================================
-- 3. ÍNDICES DE PERFORMANCE (FTS + PGVECTOR HNSW + FILTROS)
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_manuais_categoria_arquivado
  ON public.manuais (categoria, arquivado);

CREATE INDEX IF NOT EXISTS idx_manual_paginas_manual_page
  ON public.manual_paginas (manual_id, numero_pagina);

CREATE INDEX IF NOT EXISTS idx_manual_paginas_receita
  ON public.manual_paginas (possui_receita_modelo)
  WHERE possui_receita_modelo = true;

CREATE INDEX IF NOT EXISTS idx_manual_paginas_fts
  ON public.manual_paginas USING GIN (fts);

CREATE INDEX IF NOT EXISTS idx_manual_paginas_embedding
  ON public.manual_paginas USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_perguntas_telessaude_new_date
  ON public.perguntas_telessaude (is_new, data_publicacao DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_perguntas_telessaude_fts
  ON public.perguntas_telessaude USING GIN (fts);

CREATE INDEX IF NOT EXISTS idx_perguntas_telessaude_embedding
  ON public.perguntas_telessaude USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_sync_logs_executado_em
  ON public.sync_logs (executado_em DESC);

-- ==============================================================================
-- 4. ROW LEVEL SECURITY (RLS) — OBRIGATÓRIO EM TODAS AS TABELAS
-- ==============================================================================

ALTER TABLE public.manuais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_paginas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perguntas_telessaude ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;

-- Políticas para manuais
DROP POLICY IF EXISTS "authenticated_all_manuais" ON public.manuais;
CREATE POLICY "authenticated_all_manuais"
  ON public.manuais
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Políticas para manual_paginas
DROP POLICY IF EXISTS "authenticated_all_manual_paginas" ON public.manual_paginas;
CREATE POLICY "authenticated_all_manual_paginas"
  ON public.manual_paginas
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Políticas para perguntas_telessaude
DROP POLICY IF EXISTS "authenticated_all_perguntas_telessaude" ON public.perguntas_telessaude;
CREATE POLICY "authenticated_all_perguntas_telessaude"
  ON public.perguntas_telessaude
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Políticas para sync_logs
DROP POLICY IF EXISTS "authenticated_all_sync_logs" ON public.sync_logs;
CREATE POLICY "authenticated_all_sync_logs"
  ON public.sync_logs
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ==============================================================================
-- 5. SUPABASE STORAGE — BUCKETS PRIVADOS E POLÍTICAS RLS
-- ==============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'manuais-pdfs',
    'manuais-pdfs',
    false,
    104857600, -- 100 MB
    ARRAY['application/pdf']
  ),
  (
    'paginas-webp',
    'paginas-webp',
    false,
    5242880, -- 5 MB por página
    ARRAY['image/webp', 'image/png', 'image/jpeg']
  )
ON CONFLICT (id) DO UPDATE SET
  public = false;

DROP POLICY IF EXISTS "authenticated_select_private_buckets" ON storage.objects;
CREATE POLICY "authenticated_select_private_buckets"
  ON storage.objects
  FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND bucket_id IN ('manuais-pdfs', 'paginas-webp')
  );

DROP POLICY IF EXISTS "authenticated_insert_private_buckets" ON storage.objects;
CREATE POLICY "authenticated_insert_private_buckets"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND bucket_id IN ('manuais-pdfs', 'paginas-webp')
  );

DROP POLICY IF EXISTS "authenticated_update_private_buckets" ON storage.objects;
CREATE POLICY "authenticated_update_private_buckets"
  ON storage.objects
  FOR UPDATE
  USING (
    auth.role() = 'authenticated'
    AND bucket_id IN ('manuais-pdfs', 'paginas-webp')
  )
  WITH CHECK (
    auth.role() = 'authenticated'
    AND bucket_id IN ('manuais-pdfs', 'paginas-webp')
  );

DROP POLICY IF EXISTS "authenticated_delete_private_buckets" ON storage.objects;
CREATE POLICY "authenticated_delete_private_buckets"
  ON storage.objects
  FOR DELETE
  USING (
    auth.role() = 'authenticated'
    AND bucket_id IN ('manuais-pdfs', 'paginas-webp')
  );

-- ==============================================================================
-- 6. FUNÇÃO RPC DE BUSCA HÍBRIDA (FTS PORTUGUÊS SEM ACENTO + PGVECTOR RRF)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.buscar_conhecimento_clinico(
  query_text text DEFAULT '',
  query_embedding vector(768) DEFAULT NULL,
  filtro_categoria text DEFAULT 'todos',
  incluir_arquivados boolean DEFAULT false,
  match_count integer DEFAULT 25
)
RETURNS TABLE (
  id uuid,
  tipo_fonte text,
  titulo text,
  subtitulo text,
  categoria text,
  fonte_label text,
  palavras_chave text[],
  score double precision,
  -- Campos específicos de Manual PDF
  manual_id uuid,
  manual_titulo text,
  manual_versao text,
  manual_total_paginas integer,
  manual_arquivado boolean,
  numero_pagina integer,
  imagem_webp_path text,
  possui_fluxograma boolean,
  possui_receita_modelo boolean,
  texto_receita_verbatim text,
  texto_indexacao text,
  -- Campos específicos de TelessaúdeRS
  url_original text,
  data_publicacao date,
  especialidade text,
  resposta_direta text,
  texto_completo text,
  conduta_direta text[],
  prescricao_exames text[],
  quando_encaminhar text[],
  referencias text,
  is_new boolean
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
DECLARE
  v_clean_query text := trim(coalesce(query_text, ''));
  v_unaccent_query text := public.f_unaccent(trim(coalesce(query_text, '')));
  v_tsquery tsquery;
  v_rrf_k constant double precision := 60.0;
BEGIN
  IF v_clean_query <> '' THEN
    v_tsquery := websearch_to_tsquery('portuguese', v_unaccent_query);
  END IF;

  RETURN QUERY
  WITH
  -- ---------------------------------------------------------------------------
  -- CANDIDATOS: PÁGINAS DE MANUAIS PDF
  -- ---------------------------------------------------------------------------
  manuais_base AS (
    SELECT
      mp.id,
      mp.manual_id,
      m.titulo AS manual_titulo,
      m.categoria AS manual_categoria,
      m.versao AS manual_versao,
      m.total_paginas AS manual_total_paginas,
      m.arquivado AS manual_arquivado,
      mp.numero_pagina,
      mp.imagem_webp_path,
      mp.capitulo_tema,
      mp.subtitulo_pagina,
      mp.palavras_chave_clinicas,
      mp.possui_fluxograma,
      mp.possui_receita_modelo,
      mp.texto_receita_verbatim,
      mp.texto_indexacao,
      mp.created_at,
      CASE
        WHEN v_tsquery IS NOT NULL AND mp.fts @@ v_tsquery
          THEN ts_rank_cd(mp.fts, v_tsquery)::double precision
        WHEN v_unaccent_query <> '' AND (
          public.f_unaccent(mp.capitulo_tema) ILIKE '%' || v_unaccent_query || '%'
          OR public.f_unaccent(mp.subtitulo_pagina) ILIKE '%' || v_unaccent_query || '%'
          OR public.f_unaccent(mp.texto_indexacao) ILIKE '%' || v_unaccent_query || '%'
        )
          THEN 0.15::double precision
        ELSE 0.0::double precision
      END AS fts_score,
      CASE
        WHEN query_embedding IS NOT NULL AND mp.embedding IS NOT NULL
          THEN (1.0 - (mp.embedding <=> query_embedding))::double precision
        ELSE 0.0::double precision
      END AS vec_score
    FROM public.manual_paginas mp
    INNER JOIN public.manuais m ON m.id = mp.manual_id
    WHERE
      (incluir_arquivados OR m.arquivado = false)
      AND (
        filtro_categoria = 'todos'
        OR filtro_categoria = m.categoria
        OR (filtro_categoria = 'receita' AND mp.possui_receita_modelo = true)
      )
      AND filtro_categoria NOT IN ('TelessaúdeRS', 'novidades')
  ),
  manuais_ranked AS (
    SELECT
      mb.*,
      CASE
        WHEN mb.fts_score > 0
          THEN ROW_NUMBER() OVER (ORDER BY mb.fts_score DESC, mb.numero_pagina ASC)
        ELSE NULL
      END AS fts_rank,
      CASE
        WHEN mb.vec_score > 0.35
          THEN ROW_NUMBER() OVER (ORDER BY mb.vec_score DESC, mb.numero_pagina ASC)
        ELSE NULL
      END AS vec_rank
    FROM manuais_base mb
    WHERE
      v_clean_query = ''
      OR mb.fts_score > 0
      OR mb.vec_score > 0.35
  ),
  manuais_scored AS (
    SELECT
      mr.id,
      'manual_pagina'::text AS tipo_fonte,
      coalesce(nullif(mr.capitulo_tema, ''), mr.manual_titulo) AS titulo,
      coalesce(nullif(mr.subtitulo_pagina, ''), 'Página ' || mr.numero_pagina::text) AS subtitulo,
      mr.manual_categoria AS categoria,
      mr.manual_titulo || ' ' || mr.manual_versao || ' • Pág. ' || mr.numero_pagina::text AS fonte_label,
      mr.palavras_chave_clinicas AS palavras_chave,
      (
        CASE
          WHEN v_clean_query = '' THEN 0.5
          ELSE
            coalesce(1.0 / (v_rrf_k + mr.fts_rank), 0.0) * 1.15
            + coalesce(1.0 / (v_rrf_k + mr.vec_rank), 0.0)
            + (mr.vec_score * 0.02)
        END
        -- Prioridade para versões vigentes
        + CASE WHEN mr.manual_arquivado = false THEN 0.005 ELSE 0.0 END
      )::double precision AS score,
      mr.manual_id,
      mr.manual_titulo,
      mr.manual_versao,
      mr.manual_total_paginas,
      mr.manual_arquivado,
      mr.numero_pagina,
      mr.imagem_webp_path,
      mr.possui_fluxograma,
      mr.possui_receita_modelo,
      mr.texto_receita_verbatim,
      mr.texto_indexacao,
      NULL::text AS url_original,
      NULL::date AS data_publicacao,
      NULL::text AS especialidade,
      NULL::text AS resposta_direta,
      NULL::text AS texto_completo,
      NULL::text[] AS conduta_direta,
      NULL::text[] AS prescricao_exames,
      NULL::text[] AS quando_encaminhar,
      NULL::text AS referencias,
      false AS is_new,
      mr.created_at AS sort_ts
    FROM manuais_ranked mr
  ),

  -- ---------------------------------------------------------------------------
  -- CANDIDATOS: PERGUNTAS TELESSAÚDERS-UFRGS
  -- ---------------------------------------------------------------------------
  tele_base AS (
    SELECT
      pt.*,
      CASE
        WHEN v_tsquery IS NOT NULL AND pt.fts @@ v_tsquery
          THEN ts_rank_cd(pt.fts, v_tsquery)::double precision
        WHEN v_unaccent_query <> '' AND (
          public.f_unaccent(pt.titulo_pergunta) ILIKE '%' || v_unaccent_query || '%'
          OR public.f_unaccent(pt.especialidade) ILIKE '%' || v_unaccent_query || '%'
          OR public.f_unaccent(pt.resposta_direta) ILIKE '%' || v_unaccent_query || '%'
        )
          THEN 0.15::double precision
        ELSE 0.0::double precision
      END AS fts_score,
      CASE
        WHEN query_embedding IS NOT NULL AND pt.embedding IS NOT NULL
          THEN (1.0 - (pt.embedding <=> query_embedding))::double precision
        ELSE 0.0::double precision
      END AS vec_score
    FROM public.perguntas_telessaude pt
    WHERE
      filtro_categoria IN ('todos', 'TelessaúdeRS')
      OR (filtro_categoria = 'novidades' AND pt.is_new = true)
  ),
  tele_ranked AS (
    SELECT
      tb.*,
      CASE
        WHEN tb.fts_score > 0
          THEN ROW_NUMBER() OVER (ORDER BY tb.fts_score DESC, tb.data_publicacao DESC NULLS LAST)
        ELSE NULL
      END AS fts_rank,
      CASE
        WHEN tb.vec_score > 0.35
          THEN ROW_NUMBER() OVER (ORDER BY tb.vec_score DESC, tb.data_publicacao DESC NULLS LAST)
        ELSE NULL
      END AS vec_rank
    FROM tele_base tb
    WHERE
      v_clean_query = ''
      OR tb.fts_score > 0
      OR tb.vec_score > 0.35
  ),
  tele_scored AS (
    SELECT
      tr.id,
      'telessaude'::text AS tipo_fonte,
      tr.titulo_pergunta AS titulo,
      coalesce(nullif(tr.resposta_direta, ''), tr.especialidade) AS subtitulo,
      'TelessaúdeRS'::text AS categoria,
      'TelessaúdeRS • ' || coalesce(to_char(tr.data_publicacao, 'DD/MM/YYYY'), 'Recente') AS fonte_label,
      tr.palavras_chave,
      (
        CASE
          WHEN v_clean_query = '' THEN (CASE WHEN tr.is_new THEN 0.7 ELSE 0.55 END)
          ELSE
            coalesce(1.0 / (v_rrf_k + tr.fts_rank), 0.0) * 1.15
            + coalesce(1.0 / (v_rrf_k + tr.vec_rank), 0.0)
            + (tr.vec_score * 0.02)
        END
        + CASE WHEN tr.is_new THEN 0.002 ELSE 0.0 END
      )::double precision AS score,
      NULL::uuid AS manual_id,
      NULL::text AS manual_titulo,
      NULL::text AS manual_versao,
      NULL::integer AS manual_total_paginas,
      NULL::boolean AS manual_arquivado,
      NULL::integer AS numero_pagina,
      NULL::text AS imagem_webp_path,
      false AS possui_fluxograma,
      false AS possui_receita_modelo,
      NULL::text AS texto_receita_verbatim,
      NULL::text AS texto_indexacao,
      tr.url_original,
      tr.data_publicacao,
      tr.especialidade,
      tr.resposta_direta,
      tr.texto_completo,
      tr.conduta_direta,
      tr.prescricao_exames,
      tr.quando_encaminhar,
      tr.referencias,
      tr.is_new,
      coalesce(tr.data_publicacao::timestamptz, tr.created_at) AS sort_ts
    FROM tele_ranked tr
  ),

  -- ---------------------------------------------------------------------------
  -- UNIÃO FINAL E ORDENAÇÃO
  -- ---------------------------------------------------------------------------
  combined AS (
    SELECT * FROM manuais_scored
    UNION ALL
    SELECT * FROM tele_scored
  )
  SELECT
    c.id,
    c.tipo_fonte,
    c.titulo,
    c.subtitulo,
    c.categoria,
    c.fonte_label,
    c.palavras_chave,
    c.score,
    c.manual_id,
    c.manual_titulo,
    c.manual_versao,
    c.manual_total_paginas,
    c.manual_arquivado,
    c.numero_pagina,
    c.imagem_webp_path,
    c.possui_fluxograma,
    c.possui_receita_modelo,
    c.texto_receita_verbatim,
    c.texto_indexacao,
    c.url_original,
    c.data_publicacao,
    c.especialidade,
    c.resposta_direta,
    c.texto_completo,
    c.conduta_direta,
    c.prescricao_exames,
    c.quando_encaminhar,
    c.referencias,
    c.is_new
  FROM combined c
  ORDER BY c.score DESC, c.sort_ts DESC NULLS LAST
  LIMIT greatest(1, least(match_count, 50));
END;
$$;
