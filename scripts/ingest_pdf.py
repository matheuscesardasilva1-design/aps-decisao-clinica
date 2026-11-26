#!/usr/bin/env python3
"""
ingest_pdf.py — Pipeline de Ingestão Clínica de Manuais PDF para APS Decisão Clínica.

Funcionalidades:
  - Renderiza cada página do PDF a 150 DPI e salva em WebP (qualidade 82%) no bucket
    privado 'paginas-webp' (nitidez máxima para leitura fiel de fluxogramas).
  - Envia a imagem da página para o gemini-2.5-flash APENAS para indexação de busca
    nos bastidores (JSON estruturado com capítulo, subtítulo, palavras-chave clínicas,
    flags de fluxograma/receita e extração verbatim de receita modelo).
  - Gera embedding com text-embedding-004 e salva no PostgreSQL (Supabase).
  - Resiliência para Free Tier: delay de 4s entre chamadas + exponential backoff para
    erros 429/503 + retomada automática (--resume) a partir da última página processada.
  - Controle de versão: permite arquivar edições anteriores do mesmo manual.

Exemplo de uso:
  python scripts/ingest_pdf.py \\
    --pdf "/caminho/Manual_APS_Adulto_v1.5.pdf" \\
    --titulo "Manual da APS Adulto" \\
    --categoria "Adulto APS" \\
    --versao "v1.5 - Out/2026" \\
    --archive-previous
"""

from __future__ import annotations

import argparse
import io
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any

import fitz  # PyMuPDF
from PIL import Image
from dotenv import load_dotenv
from google import genai
from google.genai import types
from supabase import create_client, Client

load_dotenv()
load_dotenv(".env.local")

VALID_CATEGORIES = [
    "Adulto APS",
    "Obstetrícia / Pré-Natal",
    "REMUME",
    "Protocolos",
]

INDEXING_PROMPT = """Você é um indexador clínico especializado em Atenção Primária à Saúde (APS / SUS Brasil).
Analise visualmente esta página de manual clínico em PDF (incluindo textos, tabelas, quadros e fluxogramas).
Seu objetivo é APENAS extrair metadados precisos de busca. NÃO invente informações que não estejam na página.

Retorne EXCLUSIVAMENTE um objeto JSON válido com a estrutura exata abaixo:
{
  "capitulo_tema": "Nome do capítulo ou tema clínico principal da página (ex: Hipertensão Arterial Primária, Diabetes Mellitus Tipo 2, Pré-Natal de Baixo Risco)",
  "subtitulo_pagina": "Subtítulo específico ou tipo de conteúdo da página (ex: Fluxograma de Manejo Medicamentoso, Tabela de Doses SUS, Critérios Diagnósticos)",
  "palavras_chave_clinicas": ["lista", "de", "sintomas", "CIDs", "exames", "critérios", "e", "TODOS", "os", "fármacos", "citados", "inclusive", "dentro", "de", "fluxogramas", "e", "tabelas"],
  "possui_fluxograma": true ou false,
  "possui_receita_modelo": true ou false,
  "texto_receita_verbatim": "Se a página contiver um bloco de 'Exemplo de Receita', 'Modelo de Prescrição' ou prescrição estruturada pronta para o paciente, transcreva EXATAMENTE (verbatim) a prescrição e as orientações ao paciente. Caso contrário, retorne null.",
  "texto_indexacao": "Texto denso em palavras-chave clínicas, fármacos, doses, critérios de encaminhamento e termos que aparecem na página para indexação full-text e semântica."
}
"""


def call_with_backoff(fn, label: str, max_retries: int = 6, base_delay: float = 5.0):
    """Executa chamada à API com exponential backoff para erros 429 / 503 / transitórios."""
    for attempt in range(1, max_retries + 1):
        try:
            return fn()
        except Exception as exc:
            err_str = str(exc).lower()
            is_retryable = any(
                token in err_str
                for token in ["429", "resource_exhausted", "quota", "rate", "503", "500", "timeout", "temporarily"]
            )
            if not is_retryable or attempt == max_retries:
                raise
            wait_seconds = min(base_delay * (2 ** (attempt - 1)), 90.0)
            print(
                f"  [BACKOFF] {label}: erro transitório ({exc.__class__.__name__}). "
                f"Tentativa {attempt}/{max_retries}. Aguardando {wait_seconds:.1f}s..."
            )
            time.sleep(wait_seconds)


def parse_json_response(raw_text: str) -> dict[str, Any]:
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        data = json.loads(cleaned)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if match:
            return json.loads(match.group(0))
    raise ValueError(f"Resposta da IA não é um JSON válido: {raw_text[:300]}")


def render_page_to_webp(page: fitz.Page, dpi: int = 150, quality: int = 82) -> bytes:
    """Renderiza página PDF a 150 DPI e converte para WebP qualidade 82%."""
    zoom = dpi / 72.0
    matrix = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=matrix, alpha=False)
    img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
    buffer = io.BytesIO()
    img.save(buffer, format="WEBP", quality=quality, method=6)
    return buffer.getvalue()


GENERATION_MODELS = ["gemini-3-flash-preview", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]
EMBEDDING_MODEL = "gemini-embedding-001"


def index_page_with_gemini(client: genai.Client, webp_bytes: bytes) -> dict[str, Any]:
    """Envia a página WebP ao Gemini Flash para extração estruturada de busca (com fallback)."""
    last_exc: Exception | None = None
    for model_name in GENERATION_MODELS:
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=[
                    types.Part.from_bytes(data=webp_bytes, mime_type="image/webp"),
                    INDEXING_PROMPT,
                ],
                config=types.GenerateContentConfig(
                    temperature=0.1,
                    response_mime_type="application/json",
                ),
            )
            return parse_json_response(response.text or "{}")
        except Exception as exc:
            last_exc = exc
            if "503" in str(exc) or "404" in str(exc):
                continue
            raise
    raise last_exc or RuntimeError("Falha ao indexar página com Gemini.")


def generate_embedding(client: genai.Client, text: str) -> list[float]:
    """Gera vetor de 768 dimensões com gemini-embedding-001."""
    safe_text = text.strip()[:8000] or "Documento clínico APS"
    resp = client.models.embed_content(
        model=EMBEDDING_MODEL,
        contents=safe_text,
        config=types.EmbedContentConfig(output_dimensionality=768),
    )
    return list(resp.embeddings[0].values)


def ensure_manual_record(
    sb: Client,
    titulo: str,
    categoria: str,
    versao: str,
    total_paginas: int,
    archive_previous: bool,
) -> dict[str, Any]:
    """Cria ou recupera o registro do manual e arquiva versões anteriores se solicitado."""
    if archive_previous:
        sb.table("manuais").update({"arquivado": True}).eq("titulo", titulo).neq("versao", versao).execute()
        print(f"[INFO] Versões anteriores de '{titulo}' marcadas como arquivadas.")

    existing = (
        sb.table("manuais")
        .select("*")
        .eq("titulo", titulo)
        .eq("versao", versao)
        .limit(1)
        .execute()
    )
    if existing.data:
        manual = existing.data[0]
        sb.table("manuais").update(
            {"total_paginas": total_paginas, "categoria": categoria, "arquivado": False}
        ).eq("id", manual["id"]).execute()
        print(f"[INFO] Retomando manual existente: {manual['id']} ({titulo} — {versao})")
        return manual

    created = (
        sb.table("manuais")
        .insert(
            {
                "titulo": titulo,
                "categoria": categoria,
                "versao": versao,
                "total_paginas": total_paginas,
                "paginas_indexadas": 0,
                "arquivado": False,
            }
        )
        .execute()
    )
    manual = created.data[0]
    print(f"[INFO] Novo manual criado: {manual['id']} ({titulo} — {versao})")
    return manual


def upload_original_pdf(sb: Client, manual_id: str, pdf_path: Path) -> str:
    storage_path = f"{manual_id}/manual.pdf"
    file_size_mb = pdf_path.stat().st_size / (1024 * 1024)
    print(f"[INFO] Enviando PDF original ({file_size_mb:.1f} MB) para bucket privado 'manuais-pdfs'...")
    with open(pdf_path, "rb") as f:
        sb.storage.from_("manuais-pdfs").upload(
            path=storage_path,
            file=f,
            file_options={"content-type": "application/pdf", "upsert": "true"},
        )
    sb.table("manuais").update({"pdf_storage_path": storage_path}).eq("id", manual_id).execute()
    print(f"[OK] PDF original salvo em manuais-pdfs/{storage_path}")
    return storage_path


def get_indexed_pages(sb: Client, manual_id: str) -> set[int]:
    resp = (
        sb.table("manual_paginas")
        .select("numero_pagina")
        .eq("manual_id", manual_id)
        .execute()
    )
    return {row["numero_pagina"] for row in (resp.data or [])}


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingestão de Manual Clínico PDF para APS Decisão Clínica")
    parser.add_argument("--pdf", required=True, help="Caminho local do arquivo PDF")
    parser.add_argument("--titulo", required=True, help="Título do manual (ex: Manual da APS Adulto)")
    parser.add_argument(
        "--categoria",
        required=True,
        choices=VALID_CATEGORIES,
        help="Categoria clínica do manual",
    )
    parser.add_argument("--versao", required=True, help="Versão do manual (ex: v1.5 - Out/2026)")
    parser.add_argument(
        "--archive-previous",
        action="store_true",
        help="Marca versões anteriores do mesmo título como arquivado=true",
    )
    parser.add_argument(
        "--no-resume",
        action="store_true",
        help="Reprocessa todas as páginas mesmo se já estiverem indexadas",
    )
    parser.add_argument("--start-page", type=int, default=1, help="Página inicial (1-indexed)")
    parser.add_argument("--end-page", type=int, default=0, help="Página final (0 = até o fim)")
    parser.add_argument(
        "--delay",
        type=float,
        default=4.0,
        help="Pausa em segundos entre chamadas ao Gemini (padrão: 4.0s para Free Tier)",
    )
    args = parser.parse_args()

    pdf_path = Path(args.pdf).expanduser().resolve()
    if not pdf_path.exists():
        print(f"[ERRO] Arquivo PDF não encontrado: {pdf_path}")
        sys.exit(1)

    supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    gemini_key = os.getenv("GEMINI_API_KEY")
    if not all([supabase_url, service_key, gemini_key]):
        print("[ERRO] Configure SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e GEMINI_API_KEY no .env")
        sys.exit(1)

    sb = create_client(supabase_url, service_key)
    gemini_client = genai.Client(api_key=gemini_key)

    doc = fitz.open(pdf_path)
    total_pages = len(doc)
    start_page = max(1, args.start_page)
    end_page = total_pages if args.end_page <= 0 else min(total_pages, args.end_page)

    print("=" * 72)
    print(f"  INGESTÃO DE MANUAL PDF — {args.titulo} ({args.versao})")
    print(f"  Total de páginas: {total_pages} | Intervalo: {start_page}..{end_page}")
    print("=" * 72)

    manual = ensure_manual_record(
        sb=sb,
        titulo=args.titulo,
        categoria=args.categoria,
        versao=args.versao,
        total_paginas=total_pages,
        archive_previous=args.archive_previous,
    )
    manual_id = manual["id"]

    if not manual.get("pdf_storage_path"):
        upload_original_pdf(sb, manual_id, pdf_path)

    already_indexed = set() if args.no_resume else get_indexed_pages(sb, manual_id)
    if already_indexed:
        print(f"[INFO] Modo retomada ativo: {len(already_indexed)} páginas já indexadas serão puladas.")

    processed_now = 0
    errors = []

    for page_num in range(start_page, end_page + 1):
        if page_num in already_indexed:
            continue

        t0 = time.time()
        print(f"\n[{page_num}/{total_pages}] Processando página {page_num}...")

        try:
            page = doc.load_page(page_num - 1)
            webp_bytes = render_page_to_webp(page, dpi=150, quality=82)
            kb = len(webp_bytes) / 1024.0
            webp_path = f"{manual_id}/pagina_{page_num:04d}.webp"

            sb.storage.from_("paginas-webp").upload(
                path=webp_path,
                file=webp_bytes,
                file_options={"content-type": "image/webp", "upsert": "true"},
            )

            meta = call_with_backoff(
                lambda: index_page_with_gemini(gemini_client, webp_bytes),
                label=f"Gemini Vision pág. {page_num}",
            )

            capitulo = str(meta.get("capitulo_tema") or "").strip()
            subtitulo = str(meta.get("subtitulo_pagina") or "").strip()
            palavras_raw = meta.get("palavras_chave_clinicas") or []
            palavras = [str(p).strip() for p in palavras_raw if str(p).strip()][:40]
            possui_fluxograma = bool(meta.get("possui_fluxograma", False))
            possui_receita = bool(meta.get("possui_receita_modelo", False))
            receita_verbatim = meta.get("texto_receita_verbatim")
            if receita_verbatim is not None:
                receita_verbatim = str(receita_verbatim).strip() or None
            if receita_verbatim:
                possui_receita = True

            texto_indexacao = str(meta.get("texto_indexacao") or "").strip()
            embedding_source = (
                f"Manual: {args.titulo} ({args.categoria})\n"
                f"Capítulo: {capitulo}\n"
                f"Subtítulo: {subtitulo}\n"
                f"Palavras-chave: {', '.join(palavras)}\n"
                f"Conteúdo: {texto_indexacao}\n"
                f"Receita: {receita_verbatim or ''}"
            )

            embedding = call_with_backoff(
                lambda: generate_embedding(gemini_client, embedding_source),
                label=f"Embedding pág. {page_num}",
            )

            record = {
                "manual_id": manual_id,
                "numero_pagina": page_num,
                "imagem_webp_path": webp_path,
                "capitulo_tema": capitulo,
                "subtitulo_pagina": subtitulo,
                "palavras_chave_clinicas": palavras,
                "possui_fluxograma": possui_fluxograma,
                "possui_receita_modelo": possui_receita,
                "texto_receita_verbatim": receita_verbatim,
                "texto_indexacao": texto_indexacao,
                "embedding": embedding,
            }

            sb.table("manual_paginas").upsert(
                record, on_conflict="manual_id,numero_pagina"
            ).execute()

            already_indexed.add(page_num)
            processed_now += 1

            sb.table("manuais").update(
                {"paginas_indexadas": len(already_indexed)}
            ).eq("id", manual_id).execute()

            elapsed = time.time() - t0
            flags = []
            if possui_fluxograma:
                flags.append("FLUXOGRAMA")
            if possui_receita:
                flags.append("RECEITA")
            flag_str = f" [{' | '.join(flags)}]" if flags else ""
            print(
                f"  [OK] Pág. {page_num} ({kb:.0f} KB WebP, {elapsed:.1f}s) — "
                f"{capitulo or 'Sem título'}{flag_str}"
            )

            # Respeita o limite de requisições por minuto do Free Tier do Gemini
            if page_num < end_page and args.delay > 0:
                time.sleep(args.delay)

        except Exception as exc:
            print(f"  [ERRO] Falha na página {page_num}: {exc}")
            errors.append({"pagina": page_num, "erro": str(exc)})
            time.sleep(max(args.delay, 4.0))

    doc.close()

    print("\n" + "=" * 72)
    print(f"  FINALIZADO: {processed_now} novas páginas indexadas.")
    print(f"  Progresso total do manual: {len(already_indexed)}/{total_pages} páginas.")
    if errors:
        print(f"  ATENÇÃO: {len(errors)} página(s) com erro. Execute novamente para retomar.")
        for e in errors[:10]:
            print(f"    - Pág. {e['pagina']}: {e['erro']}")
        sys.exit(1)
    print("=" * 72)


if __name__ == "__main__":
    main()
