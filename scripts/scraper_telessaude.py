#!/usr/bin/env python3
"""
scraper_telessaude.py — Automação Semanal TelessaúdeRS-UFRGS ("Perguntas da Semana").

Fluxo:
  1. Acessa https://www.ufrgs.br/telessauders/perguntas/ com User-Agent realista.
  2. Coleta links das publicações recentes e compara com a tabela 'perguntas_telessaude'.
  3. Para cada nova pergunta:
     - Extrai título, data de publicação, resposta direta, texto completo e referências.
     - Classifica especialidade e gera resumo estruturado com gemini-2.5-flash
       (Conduta Direta, Prescrição/Exames, Quando Encaminhar).
     - Gera embedding (text-embedding-004) e salva com is_new = true.
  4. Grava status completo na tabela 'sync_logs' (incluindo HTML bruto em caso de erro
     de seletor) — mantendo o banco Supabase sempre ativo no Free Tier.
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
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from google import genai
from google.genai import types
from supabase import create_client, Client

load_dotenv()
load_dotenv(".env.local")

BASE_URL = "https://www.ufrgs.br/telessauders/perguntas/"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer": "https://www.ufrgs.br/telessauders/",
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

PT_MONTHS = {
    "janeiro": 1, "fevereiro": 2, "março": 3, "marco": 3, "abril": 4,
    "maio": 5, "junho": 6, "julho": 7, "agosto": 8,
    "setembro": 9, "outubro": 10, "novembro": 11, "dezembro": 12,
    "jan": 1, "fev": 2, "mar": 3, "abr": 4, "mai": 5, "jun": 6,
    "jul": 7, "ago": 8, "set": 9, "out": 10, "nov": 11, "dez": 12,
}


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


def parse_pt_date(text: str) -> str | None:
    if not text:
        return None
    text = text.strip().lower()

    # ISO YYYY-MM-DD
    m_iso = re.search(r"(\d{4})-(\d{2})-(\d{2})", text)
    if m_iso:
        return f"{m_iso.group(1)}-{m_iso.group(2)}-{m_iso.group(3)}"

    # DD/MM/YYYY
    m_br = re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})", text)
    if m_br:
        d, m, y = int(m_br.group(1)), int(m_br.group(2)), int(m_br.group(3))
        return f"{y:04d}-{m:02d}-{d:02d}"

    # "18 de novembro de 2026"
    m_ext = re.search(r"(\d{1,2})\s+de\s+([a-zç]+)\s+de\s+(\d{4})", text)
    if m_ext:
        day = int(m_ext.group(1))
        month = PT_MONTHS.get(m_ext.group(2))
        year = int(m_ext.group(3))
        if month:
            return f"{year:04d}-{month:02d}-{day:02d}"

    return None


def collect_question_links(session: requests.Session, max_pages: int = 2) -> tuple[list[str], str]:
    """Coleta URLs de perguntas recentes das páginas de listagem do TelessaúdeRS."""
    found: list[str] = []
    seen: set[str] = set()
    first_html = ""

    for page_idx in range(1, max_pages + 1):
        url = BASE_URL if page_idx == 1 else urljoin(BASE_URL, f"page/{page_idx}/")
        resp = session.get(url, headers=HEADERS, timeout=25)
        if page_idx == 1:
            first_html = resp.text[:4000]
        if resp.status_code == 404 and page_idx > 1:
            break
        resp.raise_for_status()

        soup = BeautifulSoup(resp.text, "lxml")

        # Seletores prioritários (WordPress / TelessaúdeRS)
        candidates = soup.select(
            "article a[href], .post a[href], h2 a[href], h3 a[href], .entry-title a[href], main a[href]"
        )
        if not candidates:
            candidates = soup.find_all("a", href=True)

        for a in candidates:
            href = a.get("href", "").strip()
            if not href:
                continue
            full_url = urljoin(BASE_URL, href).split("#")[0].split("?")[0]
            if "/telessauders/perguntas/" not in full_url:
                continue
            trimmed = full_url.rstrip("/")
            if trimmed == BASE_URL.rstrip("/"):
                continue
            if any(skip in trimmed for skip in ["/page/", "/categoria/", "/tag/", "/feed"]):
                continue
            if trimmed not in seen:
                seen.add(trimmed)
                found.append(full_url)

        time.sleep(1.0)

    return found, first_html


def scrape_question_detail(session: requests.Session, url: str) -> dict[str, Any]:
    """Extrai conteúdo clínico de uma página individual de Pergunta da Semana."""
    resp = session.get(url, headers=HEADERS, timeout=25)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "lxml")

    # Título
    title_el = (
        soup.select_one("h1.entry-title")
        or soup.select_one("article h1")
        or soup.select_one("h1")
        or soup.select_one("title")
    )
    titulo = title_el.get_text(" ", strip=True) if title_el else ""
    titulo = re.sub(r"\s*[-–|]\s*TelessaúdeRS.*$", "", titulo, flags=re.IGNORECASE).strip()

    # Data
    date_str = None
    time_el = soup.select_one("time[datetime]")
    if time_el and time_el.get("datetime"):
        date_str = parse_pt_date(time_el["datetime"])
    if not date_str:
        meta_date = soup.select_one('meta[property="article:published_time"]')
        if meta_date and meta_date.get("content"):
            date_str = parse_pt_date(meta_date["content"])
    if not date_str:
        date_el = soup.select_one(".entry-date, .post-date, .published, time")
        if date_el:
            date_str = parse_pt_date(date_el.get_text(" ", strip=True))

    # Corpo principal
    content_el = (
        soup.select_one(".entry-content")
        or soup.select_one("article .content")
        or soup.select_one("article")
        or soup.select_one("main")
    )
    if not content_el:
        raise ValueError(f"Seletor de conteúdo não encontrado em {url}")

    # Remove elementos ruidosos
    for tag in content_el.select("script, style, nav, .sharedaddy, .jp-relatedposts, form"):
        tag.decompose()

    paragraphs = [
        p.get_text(" ", strip=True)
        for p in content_el.find_all(["p", "li", "h2", "h3", "h4"])
        if p.get_text(" ", strip=True)
    ]
    full_text = "\n".join(paragraphs)

    # Separa referências se presentes
    referencias = ""
    ref_match = re.split(r"\n(?:Referências|Referencias)\s*:?\n", full_text, maxsplit=1, flags=re.IGNORECASE)
    if len(ref_match) == 2:
        body_text, referencias = ref_match[0].strip(), ref_match[1].strip()
    else:
        body_text = full_text.strip()

    resposta_direta = paragraphs[0] if paragraphs else ""

    if not titulo or len(body_text) < 60:
        raise ValueError(
            f"Conteúdo insuficiente extraído de {url} (titulo='{titulo[:60]}', chars={len(body_text)})"
        )

    return {
        "url_original": url,
        "titulo_pergunta": titulo,
        "data_publicacao": date_str or datetime.date.today().isoformat(),
        "resposta_direta": resposta_direta[:1000],
        "texto_completo": body_text[:18000],
        "referencias": referencias[:6000],
        "raw_html_snippet": resp.text[:2500],
    }


def structure_with_gemini(client: genai.Client, item: dict[str, Any]) -> dict[str, Any]:
    prompt = (
        f"{STRUCTURING_PROMPT}\n\n"
        f"PERGUNTA: {item['titulo_pergunta']}\n"
        f"TEXTO OFICIAL:\n{item['texto_completo'][:12000]}"
    )
    resp = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
        config=types.GenerateContentConfig(
            temperature=0.1,
            response_mime_type="application/json",
        ),
    )
    return parse_json_response(resp.text or "{}")


def generate_embedding(client: genai.Client, text: str) -> list[float]:
    resp = client.models.embed_content(
        model="text-embedding-004",
        contents=text.strip()[:8000],
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
    parser.add_argument("--max-pages", type=int, default=2, help="Páginas de listagem a verificar")
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
    print("  SYNC TELESSAÚDERS-UFRGS — PERGUNTAS DA SEMANA")
    print("=" * 72)

    try:
        links, listing_html_snippet = collect_question_links(session, max_pages=args.max_pages)
        print(f"[INFO] {len(links)} links de perguntas encontrados na listagem.")

        if not links:
            msg = "Nenhum link encontrado na listagem do TelessaúdeRS (possível mudança de seletor HTML)."
            print(f"[ERRO] {msg}")
            log_sync(
                sb,
                status="erro",
                novas=0,
                verificadas=0,
                mensagem=msg,
                detalhes_erro={"url": BASE_URL, "html_snippet": listing_html_snippet},
            )
            sys.exit(1)

        existing_resp = sb.table("perguntas_telessaude").select("url_original").execute()
        existing_urls = {row["url_original"].rstrip("/") for row in (existing_resp.data or [])}

        new_links = [u for u in links if u.rstrip("/") not in existing_urls][: args.max_new]
        print(f"[INFO] {len(new_links)} nova(s) pergunta(s) para processar.")

        if not new_links:
            msg = f"Base já atualizada ({len(links)} links verificados, 0 novidades)."
            print(f"[OK] {msg}")
            log_sync(sb, status="sucesso", novas=0, verificadas=len(links), mensagem=msg)
            return

        inserted = 0
        item_errors: list[dict[str, Any]] = []

        for idx, url in enumerate(new_links, start=1):
            print(f"\n[{idx}/{len(new_links)}] Coletando: {url}")
            try:
                scraped = scrape_question_detail(session, url)

                structured = call_with_backoff(
                    lambda: structure_with_gemini(gemini_client, scraped),
                    label=f"Gemini Telessaúde ({idx})",
                )

                especialidade = str(structured.get("especialidade") or "Atenção Primária").strip()
                resposta_direta = str(
                    structured.get("resposta_direta") or scraped["resposta_direta"]
                ).strip()
                conduta_direta = [str(x).strip() for x in (structured.get("conduta_direta") or []) if str(x).strip()]
                prescricao_exames = [str(x).strip() for x in (structured.get("prescricao_exames") or []) if str(x).strip()]
                quando_encaminhar = [str(x).strip() for x in (structured.get("quando_encaminhar") or []) if str(x).strip()]
                palavras_chave = [str(x).strip() for x in (structured.get("palavras_chave") or []) if str(x).strip()][:30]

                emb_input = (
                    f"Pergunta TelessaúdeRS ({especialidade}): {scraped['titulo_pergunta']}\n"
                    f"Resposta: {resposta_direta}\n"
                    f"Conduta: {' '.join(conduta_direta)}\n"
                    f"Prescrição/Exames: {' '.join(prescricao_exames)}\n"
                    f"Encaminhamento: {' '.join(quando_encaminhar)}\n"
                    f"Texto: {scraped['texto_completo'][:3500]}"
                )
                embedding = call_with_backoff(
                    lambda: generate_embedding(gemini_client, emb_input),
                    label=f"Embedding Telessaúde ({idx})",
                )

                sb.table("perguntas_telessaude").upsert(
                    {
                        "url_original": scraped["url_original"],
                        "titulo_pergunta": scraped["titulo_pergunta"],
                        "data_publicacao": scraped["data_publicacao"],
                        "especialidade": especialidade,
                        "resposta_direta": resposta_direta,
                        "texto_completo": scraped["texto_completo"],
                        "conduta_direta": conduta_direta,
                        "prescricao_exames": prescricao_exames,
                        "quando_encaminhar": quando_encaminhar,
                        "referencias": scraped["referencias"],
                        "palavras_chave": palavras_chave,
                        "is_new": True,
                        "embedding": embedding,
                    },
                    on_conflict="url_original",
                ).execute()

                inserted += 1
                print(f"  [OK] Salva: {scraped['titulo_pergunta'][:80]} [{especialidade}]")

                if idx < len(new_links) and args.delay > 0:
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
            f"{len(links)} verificada(s), {len(item_errors)} erro(s)."
        )
        print(f"\n[FIM] {mensagem}")
        log_sync(
            sb,
            status=status,
            novas=inserted,
            verificadas=len(links),
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
