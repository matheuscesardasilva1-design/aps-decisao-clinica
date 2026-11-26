import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GoogleGenAI } from "@google/genai";

const MODELS = ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-3-flash-preview"];

export async function POST(request: NextRequest) {
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
      titulo?: string;
      conteudo?: string;
      imagePaths?: string[];
    };

    const titulo = (body.titulo || "").trim();
    const conteudo = (body.conteudo || "").trim();
    const imagePaths = Array.isArray(body.imagePaths) ? body.imagePaths.slice(0, 5) : [];

    if (!titulo && imagePaths.length === 0) {
      return NextResponse.json(
        { error: "Informe o tema ou páginas do protocolo." },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY não configurada." }, { status: 500 });
    }

    // Baixa até 4 páginas WebP originais do bucket privado para ler doses e tabelas EXATAS
    const imageParts: { inlineData: { mimeType: string; data: string } }[] = [];
    for (const path of imagePaths.slice(0, 4)) {
      if (!path || path.includes("..")) continue;
      const { data: blob } = await supabase.storage.from("paginas-webp").download(path);
      if (blob) {
        const buf = Buffer.from(await blob.arrayBuffer());
        imageParts.push({
          inlineData: {
            mimeType: "image/webp",
            data: buf.toString("base64"),
          },
        });
      }
    }

    const ai = new GoogleGenAI({ apiKey });
    const prompt = `Você é um médico de família na Atenção Primária à Saúde (APS / SUS Brasil).
Leia visualmente as páginas originais anexadas do manual clínico sobre "${titulo}" (incluindo tabelas de doses, quadros de posologia e exemplos de receita) e monte um RECEITUÁRIO PRONTO PARA COPIAR E COLAR no prontuário/receita do paciente.

REGRAS ESTRITAS:
1. NUNCA escreva preâmbulos ("Com base no protocolo...", "Nota:", "---", comentários). Comece DIRETO pela via de administração (ex: USO ORAL ou USO INALATÓRIO).
2. NUNCA use siglas vagas como "CI + LABA" ou "SABA" na prescrição final. Escreva o FÁRMACO REAL, CONCENTRAÇÃO NUMÉRICA EXATA, APRESENTAÇÃO (ex: comprimido, spray/aerossol, cápsula inalatória, suspensão) e QUANTIDADE conforme as tabelas do manual e apresentações padrão do SUS/RENAME (ex: "Beclometasona 250 mcg/jato (spray) — 1 frasco", "Salbutamol 100 mcg/jato (spray) — 1 frasco", "Formoterol 6 mcg + Budesonida 200 mcg (cápsula inalatória) — 1 frasco c/ 60 cáps").
3. Escreva posologia clara em linguagem acessível ao paciente (ex: "Inalar 1 jato de 12 em 12 horas, uso contínuo. Lavar a boca com água após o uso.").
4. Se houver opções de 1ª linha e alternativa, separe de forma ultra-objetiva (ex: "=== OPÇÃO 1 (1ª LINHA) ===" e "=== OPÇÃO 2 (ALTERNATIVA) ===").
5. Feche com um bloco curto "ORIENTAÇÕES:" (máximo 3 a 4 linhas práticas).

Contexto adicional de busca:
${conteudo.slice(0, 3000)}`;

    const contents = [...imageParts, prompt];

    let text = "";
    let lastErr: unknown;
    for (const model of MODELS) {
      try {
        const resp = await ai.models.generateContent({
          model,
          contents,
          config: { temperature: 0.1 },
        });
        text = (resp.text || "").trim();
        if (text) break;
      } catch (err) {
        lastErr = err;
      }
    }

    if (!text) {
      throw lastErr instanceof Error ? lastErr : new Error("Falha ao gerar prescrição.");
    }

    return NextResponse.json({ prescription: text });
  } catch (err) {
    console.error("[prescription] Erro:", err);
    return NextResponse.json(
      { error: "Não foi possível montar a prescrição no momento." },
      { status: 500 }
    );
  }
}
