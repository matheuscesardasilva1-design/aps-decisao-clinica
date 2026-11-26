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
    };

    const titulo = (body.titulo || "").trim();
    const conteudo = (body.conteudo || "").trim();

    if (!titulo || !conteudo) {
      return NextResponse.json(
        { error: "Informe o tema e o conteúdo clínico do protocolo." },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY não configurada." }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });
    const prompt = `Você é um médico de família na Atenção Primária (APS / SUS).
Com base EXCLUSIVAMENTE nos trechos oficiais do protocolo abaixo sobre "${titulo}", gere um modelo prático de PRESCRIÇÃO PRONTA para copiar e colar no prontuário eletrônico ou receita do paciente.

REGRAS OBRIGATÓRIAS:
1. Utilize APENAS medicamentos, doses e posologias explicitamente citados no texto fornecido. NÃO invente doses.
2. Formato limpo, pronto para colar no prontuário (sem markdown excessivo, sem asteriscos):
   USO ORAL / TÓPICO / INJETÁVEL (conforme o caso)
   1) Medicamento + concentração — quantidade
      Posologia clara ao paciente (ex: Tomar 1 comprimido de 12/12h por X dias).
   ORIENTAÇÕES AO PACIENTE:
   - Pontos práticos de uso, sinais de alerta e retorno.
3. Se o texto citar mais de uma opção (ex: 1ª linha e alternativa), separe claramente em "OPÇÃO 1ª LINHA" e "ALTERNATIVA".

CONTEÚDO OFICIAL DO PROTOCOLO:
${conteudo.slice(0, 12000)}`;

    let text = "";
    let lastErr: unknown;
    for (const model of MODELS) {
      try {
        const resp = await ai.models.generateContent({
          model,
          contents: prompt,
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
