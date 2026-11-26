import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { embedClinicalText, structureTelessaudeQuestion } from "@/lib/gemini";
import { sleep } from "@/lib/utils";

const TELESSAUDE_BASE = "https://www.ufrgs.br/telessauders/perguntas/";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#8211;/g, "-")
    .replace(/&#8217;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractQuestionLinks(html: string): string[] {
  const regex = /href=["'](https?:\/\/www\.ufrgs\.br\/telessauders\/perguntas\/[^"'#?]+)["']/gi;
  const found = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const url = match[1].replace(/\/+$/, "");
    if (
      url !== TELESSAUDE_BASE.replace(/\/+$/, "") &&
      !url.includes("/page/") &&
      !url.includes("/categoria/") &&
      !url.includes("/tag/") &&
      !url.includes("/feed")
    ) {
      found.add(`${url}/`);
    }
  }
  return Array.from(found);
}

export async function POST() {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    // Opção 1: Se GITHUB_TOKEN + GITHUB_REPO estiverem configurados, dispara o GitHub Action completo
    const ghToken = process.env.GITHUB_TOKEN;
    const ghRepo = process.env.GITHUB_REPO;
    if (ghToken && ghRepo) {
      const ghRes = await fetch(
        `https://api.github.com/repos/${ghRepo}/actions/workflows/sync_telessaude.yml/dispatches`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${ghToken}`,
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ref: "main",
            inputs: { max_pages: "2", max_new: "10" },
          }),
        }
      );

      if (ghRes.ok) {
        return NextResponse.json({
          mode: "github_actions",
          message:
            "Workflow do GitHub Actions disparado com sucesso! Os resultados aparecerão nos logs em alguns minutos.",
        });
      }
    }

    // Opção 2: Captura direta leve (até 3 novidades por clique para respeitar timeout serverless)
    const listResp = await fetch(TELESSAUDE_BASE, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "pt-BR,pt;q=0.9" },
      cache: "no-store",
    });

    if (!listResp.ok) {
      const msg = `Falha HTTP ${listResp.status} ao acessar TelessaúdeRS.`;
      await supabase.from("sync_logs").insert({
        fonte: "telessaude_rs",
        status: "erro",
        novas_perguntas: 0,
        total_verificadas: 0,
        mensagem: msg,
      });
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    const listHtml = await listResp.text();
    const links = extractQuestionLinks(listHtml);

    if (links.length === 0) {
      const msg = "Nenhum link detectado na página do TelessaúdeRS (possível mudança de HTML).";
      await supabase.from("sync_logs").insert({
        fonte: "telessaude_rs",
        status: "erro",
        novas_perguntas: 0,
        total_verificadas: 0,
        mensagem: msg,
        detalhes_erro: { html_snippet: listHtml.slice(0, 2000) },
      });
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    const { data: existingRows } = await supabase
      .from("perguntas_telessaude")
      .select("url_original");

    const existingSet = new Set(
      (existingRows || []).map((r) => r.url_original.replace(/\/+$/, ""))
    );
    const newLinks = links
      .filter((u) => !existingSet.has(u.replace(/\/+$/, "")))
      .slice(0, 3);

    if (newLinks.length === 0) {
      const msg = `Base já atualizada (${links.length} links verificados, 0 novidades).`;
      await supabase.from("sync_logs").insert({
        fonte: "telessaude_rs",
        status: "sucesso",
        novas_perguntas: 0,
        total_verificadas: links.length,
        mensagem: msg,
      });
      return NextResponse.json({ mode: "direct", novas: 0, message: msg });
    }

    let inserted = 0;
    const errors: { url: string; error: string }[] = [];

    for (let i = 0; i < newLinks.length; i++) {
      const url = newLinks[i];
      try {
        const pageResp = await fetch(url, {
          headers: { "User-Agent": USER_AGENT, "Accept-Language": "pt-BR,pt;q=0.9" },
          cache: "no-store",
        });
        if (!pageResp.ok) throw new Error(`HTTP ${pageResp.status}`);
        const html = await pageResp.text();

        const titleMatch = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
        const titulo = titleMatch ? stripHtml(titleMatch[1]) : url;

        const dateMatch = /datetime=["'](\d{4}-\d{2}-\d{2})/i.exec(html);
        const dataPub = dateMatch ? dateMatch[1] : new Date().toISOString().slice(0, 10);

        const articleMatch =
          /<div[^>]*class=["'][^"']*entry-content[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*(?:<\/article>|<footer|<div[^>]*class=["'][^"']*sharedaddy)/i.exec(
            html
          ) || /<article[^>]*>([\s\S]*?)<\/article>/i.exec(html);

        const textoCompleto = stripHtml(articleMatch ? articleMatch[1] : html).slice(0, 14000);
        if (textoCompleto.length < 60) {
          throw new Error("Conteúdo clínico insuficiente na página.");
        }

        const structured = await structureTelessaudeQuestion(titulo, textoCompleto);
        const embText = `${titulo}\n${structured.resposta_direta}\n${structured.conduta_direta.join(" ")}\n${textoCompleto.slice(0, 3000)}`;
        const embedding = await embedClinicalText(embText);

        await supabase.from("perguntas_telessaude").upsert(
          {
            url_original: url,
            titulo_pergunta: titulo,
            data_publicacao: dataPub,
            especialidade: structured.especialidade,
            resposta_direta: structured.resposta_direta,
            texto_completo: textoCompleto,
            conduta_direta: structured.conduta_direta,
            prescricao_exames: structured.prescricao_exames,
            quando_encaminhar: structured.quando_encaminhar,
            referencias: "",
            palavras_chave: structured.palavras_chave,
            is_new: true,
            embedding: `[${embedding.join(",")}]`,
          },
          { onConflict: "url_original" }
        );

        inserted++;
        if (i < newLinks.length - 1) {
          await sleep(4000);
        }
      } catch (err) {
        errors.push({ url, error: err instanceof Error ? err.message : String(err) });
      }
    }

    const status = errors.length === 0 ? "sucesso" : inserted > 0 ? "parcial" : "erro";
    const msg = `Captura manual: ${inserted} nova(s) pergunta(s) salva(s) de ${links.length} verificada(s).`;

    await supabase.from("sync_logs").insert({
      fonte: "telessaude_rs",
      status,
      novas_perguntas: inserted,
      total_verificadas: links.length,
      mensagem: msg,
      detalhes_erro: errors.length > 0 ? { erros: errors } : null,
    });

    return NextResponse.json({
      mode: "direct",
      novas: inserted,
      erros: errors.length,
      message: msg,
    });
  } catch (err) {
    console.error("[admin/sync-telessaude] Erro:", err);
    return NextResponse.json(
      { error: "Erro ao executar sincronização do TelessaúdeRS." },
      { status: 500 }
    );
  }
}
