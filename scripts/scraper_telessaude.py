#!/usr/bin/env python3
"""
scraper_telessaude.py — Automação Semanal TelessaúdeRS-UFRGS ("Perguntas da Semana").

Fluxo:
  1. Consulta a API JSON oficial do portal TelessaúdeRS-UFRGS
     (https://api-site.telessauders.ufrgs.br/perguntas/search-by-tags/?fields=*).
  2. Verifica quais URLs oficiais (https://telessauders.ufrgs.br/perguntas/{id})
     ainda não existem na tabela 'perguntas_telessaude' do Supabase.
  3. Para cada novidade:
     - Extrai título, data de publicação, resumo, conteúdo oficial completo,
       referências e tags oficiais.
     - Classifica especialidade e gera resumo estruturado com Gemini Flash
       (Conduta Direta, Prescrição/Exames, Quando Encaminhar).
     - Gera embedding de 768 dimensões (gemini-embedding-001) e salva com is_new = true.
  4. Grava status completo na tabela 'sync_logs' (mantendo o Supabase Free Tier ativo).
"""

from __future__ import annotations

import argparse
import datetime
import json
import os
import re
import sys
import time
import traceback
from typing import Any

import requests
from bs4 import BeautifulSoup, Comment
from dotenv import load_dotenv
from google import genai
from google.genai import types
from supabase import create_client, Client

load_dotenv()
load_dotenv(".env.local")

API_URL = "https://api-site.telessauders.ufrgs.br/perguntas/search-by-tags/"
WEB_BASE_URL = "https://telessauders.ufrgs.br/perguntas"
GENERATION_MODELS = ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-3-flash-preview"]
EMBEDDING_MODEL = "gemini-embedding-001"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer": "https://telessauders.ufrgs.br/perguntas",
}

STRUCTURING_PROMPT = """Você é um médico de família e comunidade (MFC) estruturando uma Pergunta da Semana do TelessaúdeRS-UFRGS para consulta rápida em consultório de APS.
Com base EXCLUSIVAMENTE no texto oficial fornecido abaixo, retorne um JSON válido com esta estrutura:
{
  "especialidade": "Uma especialidade principal (ex: Cardiologia, Endocrinologia, Obstetrícia, Ginecologia, Infectologia, Pediatria, Psiquiatria, Neurologia, Dermatologia, Pneumologia, Gastroenterologia, Regulação, Atenção Primária)",
  "resposta_direta": "Síntese fiel em 1 a 2 frases respondendo diretamente à pergunta clínica.",
  "conduta_direta": ["tópico objetivo 1 de conduta na APS", "tópico objetivo 2"],
  "prescricao_exames": ["fármacos, doses ou exames citados no texto oficial (lista vazia se não houver)"],
  "quando_encaminhar": ["critérios de encaminhamento ou sinais de alerta citados (lista vazia se não houver)"],
  "palavras_chave": ["lista", "de", "termos", "clínicos", "e", "medicamentos", "relevantes"]
}
NÃO invente doses ou critérios que não constem no texto oficial.
"""


def call_with_backoff(fn, label: str, max_retries: int = 5, base_delay: float = 5.0):
    for attempt in range(1, max_retries + 1):
        try:
            return fn()
        except Exception as exc:
            err_str = str(exc).lower()
            is_retryable = any(
                token in err_str
                for token in ["429", "resource_exhausted", "quota", "rate", "503", "500", "timeout"]
            )
            if not is_retryable or attempt == max_retries:
                raise
            wait_s = min(base_delay * (2 ** (attempt - 1)), 90.0)
            print(f"  [BACKOFF] {label}: tentativa {attempt}/{max_retries}, aguardando {wait_s:.1f}s...")
            time.sleep(wait_s)


def parse_json_response(raw_text: str) -> dict[str, Any]:
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if match:
            return json.loads(match.group(0))
        raise


ALLOWED_HTML_TAGS = {
    "p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li",
    "h2", "h3", "h4", "table", "thead", "tbody", "tfoot", "tr", "th", "td",
    "blockquote", "a", "sup", "sub", "caption", "img", "figure", "figcaption",
}


def sanitize_clinical_html(html: str) -> str:
    """Preserva tabelas, figuras/fluxogramas, listas e negritos oficiais removendo scripts e lixo de Word."""
    if not html:
        return ""
    # Remove blocos condicionais de Word/IE (ex: [if IE]>)
    html = re.sub(r"<!--\[if[\s\S]*?<!\[endif\]-->", "", html, flags=re.IGNORECASE)
    html = re.sub(r"\[if\s+[^\]]+\]>?", "", html, flags=re.IGNORECASE)

    soup = BeautifulSoup(html, "lxml")
    for comment in soup.find_all(string=lambda t: isinstance(t, Comment)):
        comment.extract()

    for tag in soup.select("script, style, iframe, form, object, embed, title, meta"):
        tag.decompose()

    for tag in list(soup.find_all(True)):
        # Preserva fluxogramas interativos oficiais draw.io / diagrams.net do TelessaúdeRS
        if tag.name == "div" and "mxgraph" in (tag.get("class") or []) and tag.get("data-mxgraph"):
            tag.attrs = {
                "class": "mxgraph",
                "data-mxgraph": tag["data-mxgraph"],
                "style": "max-width:100%;border:1px solid rgba(15,23,42,0.1);border-radius:12px;margin:16px 0;background:#ffffff;overflow:hidden;",
            }
            continue
        if tag.name not in ALLOWED_HTML_TAGS:
            tag.unwrap()
            continue
        if tag.name == "a":
            href = tag.get("href", "")
            tag.attrs = {"href": href, "target": "_blank", "rel": "noopener noreferrer"} if href.startswith(("http://", "https://")) else {}
        elif tag.name == "img":
            src = (tag.get("src") or "").strip()
            if src.startswith("/"):
                src = f"https://api-site.telessauders.ufrgs.br{src}"
            if src.startswith(("http://", "https://")):
                alt = (tag.get("alt") or "Figura oficial TelessaúdeRS").strip()
                tag.attrs = {
                    "src": src,
                    "alt": alt,
                    "loading": "lazy",
                    "style": "max-width:100%;height:auto;border-radius:10px;margin:16px auto;display:block;background:#ffffff;padding:8px;border:1px solid rgba(15,23,42,0.08);",
                }
            else:
                tag.decompose()
        elif tag.name in ("td", "th"):
            keep = {}
            if tag.get("colspan"):
                keep["colspan"] = tag["colspan"]
            if tag.get("rowspan"):
                keep["rowspan"] = tag["rowspan"]
            tag.attrs = keep
        else:
            tag.attrs = {}

    body = soup.body or soup
    return "".join(str(c) for c in body.contents).strip()


def html_to_text(html: str) -> str:
    if not html:
        return ""
    soup = BeautifulSoup(html, "lxml")
    for tag in soup.select("script, style"):
        tag.decompose()
    lines = [line.strip() for line in soup.get_text("\n").splitlines() if line.strip()]
    return "\n".join(lines)


def fetch_recent_questions(session: requests.Session, max_pages: int = 2, page_size: int = 15) -> list[dict[str, Any]]:
    collected: list[dict[str, Any]] = []
    for page_idx in range(max_pages):
        offset = page_idx * page_size
        resp = session.get(
            API_URL,
            params={"fields": "*", "limit": page_size, "offset": offset},
            headers=HEADERS,
            timeout=25,
        )
        resp.raise_for_status()
        data = resp.json()
        items = data.get("perguntas") or []
        if not items:
            break
        collected.extend(items)
        if len(items) < page_size:
            break
        time.sleep(0.8)
    return collected


def structure_with_gemini(client: genai.Client, titulo: str, texto_completo: str) -> dict[str, Any]:
    prompt = (
        f"{STRUCTURING_PROMPT}\n\n"
        f"PERGUNTA: {titulo}\n"
        f"TEXTO OFICIAL:\n{texto_completo[:12000]}"
    )
    last_exc: Exception | None = None
    for model_name in GENERATION_MODELS:
        try:
            resp = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=0.1,
                    response_mime_type="application/json",
                ),
            )
            return parse_json_response(resp.text or "{}")
        except Exception as exc:
            last_exc = exc
            err_s = str(exc).lower()
            if any(k in err_s for k in ("503", "404", "429", "resource_exhausted", "quota")):
                continue
            raise
    raise last_exc or RuntimeError("Falha ao estruturar pergunta com Gemini.")


def generate_embedding(client: genai.Client, text: str) -> list[float]:
    resp = client.models.embed_content(
        model=EMBEDDING_MODEL,
        contents=text.strip()[:8000],
        config=types.EmbedContentConfig(output_dimensionality=768),
    )
    return list(resp.embeddings[0].values)


def log_sync(
    sb: Client,
    status: str,
    novas: int,
    verificadas: int,
    mensagem: str,
    detalhes_erro: dict[str, Any] | None = None,
) -> None:
    sb.table("sync_logs").insert(
        {
            "fonte": "telessaude_rs",
            "status": status,
            "novas_perguntas": novas,
            "total_verificadas": verificadas,
            "mensagem": mensagem,
            "detalhes_erro": detalhes_erro,
        }
    ).execute()


def main() -> None:
    parser = argparse.ArgumentParser(description="Sincronizador TelessaúdeRS-UFRGS")
    parser.add_argument("--max-pages", type=int, default=2, help="Páginas da API a verificar")
    parser.add_argument("--max-new", type=int, default=15, help="Limite máximo de novas perguntas por execução")
    parser.add_argument("--delay", type=float, default=4.0, help="Pausa em segundos entre chamadas ao Gemini")
    args = parser.parse_args()

    supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    gemini_key = os.getenv("GEMINI_API_KEY")
    if not all([supabase_url, service_key, gemini_key]):
        print("[ERRO] Configure SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e GEMINI_API_KEY.")
        sys.exit(1)

    sb = create_client(supabase_url, service_key)
    gemini_client = genai.Client(api_key=gemini_key)
    session = requests.Session()

    print("=" * 72)
    print("  SYNC TELESSAÚDERS-UFRGS — PERGUNTAS DA SEMANA (API OFICIAL)")
    print("=" * 72)

    try:
        api_items = fetch_recent_questions(session, max_pages=args.max_pages, page_size=15)
        print(f"[INFO] {len(api_items)} pergunta(s) retornada(s) pela API oficial.")

        if not api_items:
            msg = "Nenhuma pergunta retornada pela API do TelessaúdeRS."
            print(f"[ERRO] {msg}")
            log_sync(sb, status="erro", novas=0, verificadas=0, mensagem=msg)
            sys.exit(1)

        existing_resp = sb.table("perguntas_telessaude").select("url_original").execute()
        existing_urls = {row["url_original"].rstrip("/") for row in (existing_resp.data or [])}

        new_items = []
        for item in api_items:
            q_id = item.get("id")
            if not q_id:
                continue
            url = f"{WEB_BASE_URL}/{q_id}"
            if url not in existing_urls:
                new_items.append((url, item))

        new_items = new_items[: args.max_new]
        print(f"[INFO] {len(new_items)} nova(s) pergunta(s) para processar.")

        if not new_items:
            msg = f"Base já atualizada ({len(api_items)} perguntas verificadas, 0 novidades)."
            print(f"[OK] {msg}")
            log_sync(sb, status="sucesso", novas=0, verificadas=len(api_items), mensagem=msg)
            return

        inserted = 0
        item_errors: list[dict[str, Any]] = []

        for idx, (url, item) in enumerate(new_items, start=1):
            titulo = (item.get("titulo") or f"Pergunta #{item.get('id')}").strip()
            print(f"\n[{idx}/{len(new_items)}] Processando: {titulo[:75]}...")
            try:
                body_html = item.get("rendered_body") or item.get("conteudo") or ""
                conteudo_html = sanitize_clinical_html(body_html)[:180000]
                texto_completo = html_to_text(body_html)[:18000]
                if len(texto_completo) < 40:
                    texto_completo = (item.get("resumo") or "").strip()

                referencias = html_to_text(item.get("referencias") or "")[:6000]
                data_pub = (
                    item.get("data_de_publicacao")
                    or item.get("data_referencia")
                    or datetime.date.today().isoformat()
                )
                official_tags = [str(t).strip() for t in (item.get("tags") or []) if str(t).strip()]

                structured = call_with_backoff(
                    lambda: structure_with_gemini(gemini_client, titulo, texto_completo),
                    label=f"Gemini Telessaúde ({idx})",
                )

                especialidade = str(structured.get("especialidade") or "Atenção Primária").strip()
                resposta_direta = str(
                    structured.get("resposta_direta") or item.get("resumo") or ""
                ).strip()
                conduta_direta = [str(x).strip() for x in (structured.get("conduta_direta") or []) if str(x).strip()]
                prescricao_exames = [str(x).strip() for x in (structured.get("prescricao_exames") or []) if str(x).strip()]
                quando_encaminhar = [str(x).strip() for x in (structured.get("quando_encaminhar") or []) if str(x).strip()]
                ai_tags = [str(x).strip() for x in (structured.get("palavras_chave") or []) if str(x).strip()]
                merged_tags = list(dict.fromkeys(official_tags + ai_tags))[:30]

                emb_input = (
                    f"Pergunta TelessaúdeRS ({especialidade}): {titulo}\n"
                    f"Resposta: {resposta_direta}\n"
                    f"Conduta: {' '.join(conduta_direta)}\n"
                    f"Prescrição/Exames: {' '.join(prescricao_exames)}\n"
                    f"Encaminhamento: {' '.join(quando_encaminhar)}\n"
                    f"Texto: {texto_completo[:3500]}"
                )
                embedding = call_with_backoff(
                    lambda: generate_embedding(gemini_client, emb_input),
                    label=f"Embedding Telessaúde ({idx})",
                )

                sb.table("perguntas_telessaude").upsert(
                    {
                        "url_original": url,
                        "titulo_pergunta": titulo,
                        "data_publicacao": data_pub,
                        "especialidade": especialidade,
                        "resposta_direta": resposta_direta,
                        "texto_completo": texto_completo,
                        "conteudo_html": conteudo_html,
                        "conduta_direta": conduta_direta,
                        "prescricao_exames": prescricao_exames,
                        "quando_encaminhar": quando_encaminhar,
                        "referencias": referencias,
                        "palavras_chave": merged_tags,
                        "is_new": True,
                        "embedding": embedding,
                    },
                    on_conflict="url_original",
                ).execute()

                inserted += 1
                print(f"  [OK] Salva: {titulo[:75]} [{especialidade}]")

                if idx < len(new_items) and args.delay > 0:
                    time.sleep(args.delay)

            except Exception as exc:
                print(f"  [ERRO] Falha ao processar {url}: {exc}")
                item_errors.append(
                    {
                        "url": url,
                        "erro": str(exc),
                        "traceback": traceback.format_exc()[-1000:],
                    }
                )
                time.sleep(max(args.delay, 4.0))

        status = "sucesso" if not item_errors else ("parcial" if inserted > 0 else "erro")
        mensagem = (
            f"Sincronização concluída: {inserted} nova(s) pergunta(s) adicionada(s), "
            f"{len(api_items)} verificada(s), {len(item_errors)} erro(s)."
        )
        print(f"\n[FIM] {mensagem}")
        log_sync(
            sb,
            status=status,
            novas=inserted,
            verificadas=len(api_items),
            mensagem=mensagem,
            detalhes_erro={"erros": item_errors} if item_errors else None,
        )

        if status == "erro":
            sys.exit(1)

    except Exception as exc:
        err_msg = f"Erro crítico na sincronização TelessaúdeRS: {exc}"
        print(f"[ERRO CRÍTICO] {err_msg}")
        try:
            log_sync(
                sb,
                status="erro",
                novas=0,
                verificadas=0,
                mensagem=err_msg,
                detalhes_erro={"traceback": traceback.format_exc()[-2000:]},
            )
        except Exception:
            pass
        sys.exit(1)


if __name__ == "__main__":
    main()
