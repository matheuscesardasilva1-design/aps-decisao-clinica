import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { embedClinicalText, structureTelessaudeQuestion } from "@/lib/gemini";
import { sleep } from "@/lib/utils";

const TELESSAUDE_API =
  "https://api-site.telessauders.ufrgs.br/perguntas/search-by-tags/?fields=*&limit=20&offset=0";
const TELESSAUDE_WEB_BASE = "https://telessauders.ufrgs.br/perguntas";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

interface TelessaudeApiItem {
  id: number;
  titulo?: string;
  resumo?: string;
  rendered_body?: string;
  conteudo?: string;
  referencias?: string;
  data_de_publicacao?: string;
  data_referencia?: string;
  tags?: string[];
  slug?: string;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|li|h[1-6]|div|br)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#8211;/g, "-")
    .replace(/&#8217;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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

    // Opção 1: Se GITHUB_TOKEN + GITHUB_REPO estiverem configurados, dispara o GitHub Action
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

    // Opção 2: Captura direta via API JSON oficial do TelessaúdeRS-UFRGS (até 3 novidades por clique)
    const apiResp = await fetch(TELESSAUDE_API, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
      cache: "no-store",
    });

    if (!apiResp.ok) {
      const msg = `Falha HTTP ${apiResp.status} ao acessar API do TelessaúdeRS.`;
      await supabase.from("sync_logs").insert({
        fonte: "telessaude_rs",
        status: "erro",
        novas_perguntas: 0,
        total_verificadas: 0,
        mensagem: msg,
      });
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    const payload = (await apiResp.json()) as {
      total_perguntas?: number;
      perguntas?: TelessaudeApiItem[];
    };
    const items = payload.perguntas || [];

    if (items.length === 0) {
      const msg = "Nenhuma pergunta retornada pela API do TelessaúdeRS.";
      await supabase.from("sync_logs").insert({
        fonte: "telessaude_rs",
        status: "erro",
        novas_perguntas: 0,
        total_verificadas: 0,
        mensagem: msg,
      });
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    const { data: existingRows } = await supabase
      .from("perguntas_telessaude")
      .select("url_original");

    const existingSet = new Set(
      (existingRows || []).map((r) => r.url_original.replace(/\/+$/, ""))
    );

    const newItems = items
      .filter((item) => {
        const url = `${TELESSAUDE_WEB_BASE}/${item.id}`;
        return !existingSet.has(url);
      })
      .slice(0, 3);

    if (newItems.length === 0) {
      const msg = `Base já atualizada (${items.length} perguntas verificadas, 0 novidades).`;
      await supabase.from("sync_logs").insert({
        fonte: "telessaude_rs",
        status: "sucesso",
        novas_perguntas: 0,
        total_verificadas: items.length,
        mensagem: msg,
      });
      return NextResponse.json({ mode: "direct", novas: 0, message: msg });
    }

    let inserted = 0;
    const errors: { url: string; error: string }[] = [];

    for (let i = 0; i < newItems.length; i++) {
      const item = newItems[i];
      const url = `${TELESSAUDE_WEB_BASE}/${item.id}`;
      try {
        const titulo = (item.titulo || "").trim() || `Pergunta #${item.id}`;
        const textoCompleto = stripHtml(item.rendered_body || item.conteudo || item.resumo || "").slice(
          0,
          16000
        );
        const referencias = stripHtml(item.referencias || "").slice(0, 5000);
        const dataPub =
          item.data_de_publicacao || item.data_referencia || new Date().toISOString().slice(0, 10);

        const structured = await structureTelessaudeQuestion(titulo, textoCompleto);
        const mergedTags = Array.from(
          new Set([...(item.tags || []), ...structured.palavras_chave])
        ).slice(0, 30);

        const embText = `${titulo}\n${structured.resposta_direta || item.resumo || ""}\n${structured.conduta_direta.join(" ")}\n${textoCompleto.slice(0, 3000)}`;
        const embedding = await embedClinicalText(embText);

        await supabase.from("perguntas_telessaude").upsert(
          {
            url_original: url,
            titulo_pergunta: titulo,
            data_publicacao: dataPub,
            especialidade: structured.especialidade,
            resposta_direta: structured.resposta_direta || (item.resumo || "").trim(),
            texto_completo: textoCompleto,
            conduta_direta: structured.conduta_direta,
            prescricao_exames: structured.prescricao_exames,
            quando_encaminhar: structured.quando_encaminhar,
            referencias,
            palavras_chave: mergedTags,
            is_new: true,
            embedding: `[${embedding.join(",")}]`,
          },
          { onConflict: "url_original" }
        );

        inserted++;
        if (i < newItems.length - 1) {
          await sleep(4000);
        }
      } catch (err) {
        errors.push({ url, error: err instanceof Error ? err.message : String(err) });
      }
    }

    const status = errors.length === 0 ? "sucesso" : inserted > 0 ? "parcial" : "erro";
    const msg = `Captura manual: ${inserted} nova(s) pergunta(s) salva(s) de ${items.length} verificada(s).`;

    await supabase.from("sync_logs").insert({
      fonte: "telessaude_rs",
      status,
      novas_perguntas: inserted,
      total_verificadas: items.length,
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
