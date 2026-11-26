#!/usr/bin/env python3
"""
healthcheck.py — Diagnóstico completo do ambiente APS Decisão Clínica.

Valida:
  1. Conexão com Supabase PostgreSQL e existência das tabelas principais.
  2. Permissão de upload, geração de Signed URL, leitura e limpeza nos buckets privados.
  3. Resposta válida da GEMINI_API_KEY (gemini-2.5-flash + text-embedding-004).
  4. Acesso HTTP à página oficial de Perguntas da Semana do TelessaúdeRS-UFRGS.
"""

from __future__ import annotations

import os
import sys
import uuid
import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from supabase import create_client, Client
from google import genai
from google.genai import types

load_dotenv()
load_dotenv(".env.local")

TELESSAUDE_API_URL = "https://api-site.telessauders.ufrgs.br/perguntas/search-by-tags/?fields=*&limit=5&offset=0"
GENERATION_MODELS = ["gemini-3-flash-preview", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]
EMBEDDING_MODEL = "gemini-embedding-001"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
}

OK = "\033[92m[OK]\033[0m"
FAIL = "\033[91m[ERRO]\033[0m"
INFO = "\033[94m[INFO]\033[0m"


def check_env() -> tuple[str, str, str]:
    supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    gemini_key = os.getenv("GEMINI_API_KEY")

    missing = []
    if not supabase_url:
        missing.append("SUPABASE_URL (ou NEXT_PUBLIC_SUPABASE_URL)")
    if not service_key:
        missing.append("SUPABASE_SERVICE_ROLE_KEY")
    if not gemini_key:
        missing.append("GEMINI_API_KEY")

    if missing:
        print(f"{FAIL} Variáveis de ambiente ausentes: {', '.join(missing)}")
        sys.exit(1)

    print(f"{OK} Variáveis de ambiente carregadas.")
    return supabase_url, service_key, gemini_key


def check_supabase_db(sb: Client) -> bool:
    print(f"\n{INFO} 1/4 Verificando conexão com Supabase PostgreSQL...")
    tables = ["manuais", "manual_paginas", "perguntas_telessaude", "sync_logs"]
    all_ok = True
    for table in tables:
        try:
            resp = sb.table(table).select("id", count="exact").limit(1).execute()
            total = resp.count if resp.count is not None else len(resp.data or [])
            print(f"  {OK} Tabela '{table}' acessível (registros: {total})")
        except Exception as exc:
            print(f"  {FAIL} Falha ao consultar tabela '{table}': {exc}")
            all_ok = False

    try:
        sb.rpc(
            "buscar_conhecimento_clinico",
            {"query_text": "", "filtro_categoria": "todos", "match_count": 1},
        ).execute()
        print(f"  {OK} Função RPC 'buscar_conhecimento_clinico' operacional.")
    except Exception as exc:
        print(f"  {FAIL} Falha na função RPC 'buscar_conhecimento_clinico': {exc}")
        all_ok = False

    return all_ok


def check_supabase_storage(sb: Client) -> bool:
    print(f"\n{INFO} 2/4 Verificando permissões nos buckets privados do Storage...")
    buckets = {
        "manuais-pdfs": ("application/pdf", b"%PDF-1.4\n%healthcheck\n%%EOF\n", ".pdf"),
        "paginas-webp": ("image/webp", b"RIFF\x1a\x00\x00\x00WEBPVP8 \x0e\x00\x00\x00\x30\x01\x00\x9d\x01\x2a\x01\x00\x01\x00\x02\x00\x34\x25", ".webp"),
    }
    all_ok = True
    for bucket, (mime, payload, ext) in buckets.items():
        test_path = f"_healthcheck/{uuid.uuid4().hex}{ext}"
        try:
            sb.storage.from_(bucket).upload(
                path=test_path,
                file=payload,
                file_options={"content-type": mime, "upsert": "true"},
            )
            signed = sb.storage.from_(bucket).create_signed_url(test_path, 60)
            signed_url = signed.get("signedURL") or signed.get("signedUrl")
            if not signed_url:
                raise RuntimeError(f"Signed URL não retornada: {signed}")

            r = requests.get(signed_url, timeout=15)
            if r.status_code != 200:
                raise RuntimeError(f"Leitura via Signed URL retornou HTTP {r.status_code}")

            sb.storage.from_(bucket).remove([test_path])
            print(f"  {OK} Bucket '{bucket}': upload, Signed URL, leitura e remoção OK.")
        except Exception as exc:
            print(f"  {FAIL} Bucket '{bucket}': {exc}")
            all_ok = False
    return all_ok


def check_gemini(gemini_key: str) -> bool:
    print(f"\n{INFO} 3/4 Verificando Google Gemini API ({GENERATION_MODELS[0]} + {EMBEDDING_MODEL})...")
    all_ok = True
    gen_ok = False
    client = genai.Client(api_key=gemini_key)
    for model_name in GENERATION_MODELS:
        try:
            gen_resp = client.models.generate_content(
                model=model_name,
                contents="Responda apenas com a palavra: OK",
            )
            text = (gen_resp.text or "").strip()
            print(f"  {OK} {model_name} respondeu: '{text[:40]}'")
            gen_ok = True
            break
        except Exception as exc:
            print(f"  [AVISO] {model_name} indisponível ({exc.__class__.__name__}), tentando fallback...")
    if not gen_ok:
        print(f"  {FAIL} Nenhum modelo Gemini Flash respondeu.")
        all_ok = False

    try:
        emb_resp = client.models.embed_content(
            model=EMBEDDING_MODEL,
            contents="Hipertensão arterial primária na atenção primária à saúde",
            config=types.EmbedContentConfig(output_dimensionality=768),
        )
        values = emb_resp.embeddings[0].values
        print(f"  {OK} {EMBEDDING_MODEL} respondeu com vetor de {len(values)} dimensões.")
    except Exception as exc:
        print(f"  {FAIL} Falha no {EMBEDDING_MODEL}: {exc}")
        all_ok = False

    return all_ok


def check_telessaude() -> bool:
    print(f"\n{INFO} 4/4 Verificando acesso HTTP à API oficial do TelessaúdeRS-UFRGS...")
    try:
        resp = requests.get(TELESSAUDE_API_URL, headers={**HEADERS, "Accept": "application/json"}, timeout=20)
        if resp.status_code != 200:
            print(f"  {FAIL} HTTP {resp.status_code} ao acessar {TELESSAUDE_API_URL}")
            return False

        data = resp.json()
        total = data.get("total_perguntas", 0)
        items = data.get("perguntas", [])
        print(
            f"  {OK} Acesso HTTP 200 na API oficial TelessaúdeRS-UFRGS "
            f"(total: {total} perguntas; amostra retornada: {len(items)})."
        )
        return len(items) > 0
    except Exception as exc:
        print(f"  {FAIL} Erro ao acessar TelessaúdeRS: {exc}")
        return False


def main() -> None:
    print("=" * 72)
    print("  HEALTHCHECK — APS DECISÃO CLÍNICA")
    print("=" * 72)

    supabase_url, service_key, gemini_key = check_env()
    sb = create_client(supabase_url, service_key)

    results = [
        check_supabase_db(sb),
        check_supabase_storage(sb),
        check_gemini(gemini_key),
        check_telessaude(),
    ]

    print("\n" + "=" * 72)
    if all(results):
        print(f"{OK} TODOS OS 4 TESTES PASSARAM! Ambiente pronto para produção.")
        sys.exit(0)
    else:
        print(f"{FAIL} Um ou mais testes falharam. Revise os erros acima antes de continuar.")
        sys.exit(1)


if __name__ == "__main__":
    main()
