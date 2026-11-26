import { GoogleGenAI } from "@google/genai";
import type { ClinicalSynthesis, SearchResultItem } from "@/types/clinical";

/**
 * Módulo exclusivo de servidor para chamadas à Google Gemini API.
 * Nunca importe este arquivo em Client Components ("use client").
 */
function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY não configurada no ambiente de servidor.");
  }
  return new GoogleGenAI({ apiKey });
}

function cleanJsonText(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("```")) {
    return trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
  }
  return trimmed;
}

export async function embedClinicalText(text: string): Promise<number[]> {
  const ai = getGeminiClient();
  const safeText = text.trim().slice(0, 8000);
  const response = await ai.models.embedContent({
    model: "text-embedding-004",
    contents: safeText,
  });

  const values = response.embeddings?.[0]?.values;
  if (!values || values.length === 0) {
    throw new Error("Falha ao gerar embedding com text-embedding-004.");
  }
  return values;
}

export interface PageIndexMetadata {
  capitulo_tema: string;
  subtitulo_pagina: string;
  palavras_chave_clinicas: string[];
  possui_fluxograma: boolean;
  possui_receita_modelo: boolean;
  texto_receita_verbatim: string | null;
  texto_indexacao: string;
}

export async function indexPdfPageImage(webpBase64: string): Promise<PageIndexMetadata> {
  const ai = getGeminiClient();
  const prompt = `Você é um indexador clínico especializado em Atenção Primária à Saúde (APS / SUS Brasil).
Analise visualmente esta página de manual clínico em PDF (incluindo textos, tabelas, quadros e fluxogramas).
Seu objetivo é APENAS extrair metadados precisos de busca. NÃO invente informações que não estejam na página.

Retorne EXCLUSIVAMENTE um objeto JSON válido com a estrutura:
{
  "capitulo_tema": "Nome do capítulo ou tema clínico principal da página",
  "subtitulo_pagina": "Subtítulo específico ou tipo de conteúdo (ex: Fluxograma de Manejo, Tabela de Doses SUS)",
  "palavras_chave_clinicas": ["sintomas", "CIDs", "exames", "critérios", "e TODOS os fármacos citados"],
  "possui_fluxograma": true ou false,
  "possui_receita_modelo": true ou false,
  "texto_receita_verbatim": "Se houver 'Exemplo de Receita' ou prescrição estruturada pronta, transcreva EXATAMENTE (verbatim). Caso contrário, null.",
  "texto_indexacao": "Texto denso em termos clínicos, fármacos, doses e critérios presentes na página para indexação de busca."
}`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        inlineData: {
          mimeType: "image/webp",
          data: webpBase64,
        },
      },
      prompt,
    ],
    config: {
      temperature: 0.1,
      responseMimeType: "application/json",
    },
  });

  const parsed = JSON.parse(cleanJsonText(response.text || "{}")) as Partial<PageIndexMetadata>;
  const receita =
    typeof parsed.texto_receita_verbatim === "string" && parsed.texto_receita_verbatim.trim().length > 0
      ? parsed.texto_receita_verbatim.trim()
      : null;

  return {
    capitulo_tema: (parsed.capitulo_tema || "").trim(),
    subtitulo_pagina: (parsed.subtitulo_pagina || "").trim(),
    palavras_chave_clinicas: Array.isArray(parsed.palavras_chave_clinicas)
      ? parsed.palavras_chave_clinicas.map((k) => String(k).trim()).filter(Boolean).slice(0, 40)
      : [],
    possui_fluxograma: Boolean(parsed.possui_fluxograma),
    possui_receita_modelo: Boolean(parsed.possui_receita_modelo || receita),
    texto_receita_verbatim: receita,
    texto_indexacao: (parsed.texto_indexacao || "").trim(),
  };
}

export async function synthesizeClinicalSources(
  query: string,
  sources: SearchResultItem[]
): Promise<ClinicalSynthesis> {
  const ai = getGeminiClient();

  const contextBlocks = sources.slice(0, 5).map((item, idx) => {
    if (item.tipo_fonte === "manual_pagina") {
      return [
        `[FONTE ${idx + 1}] ${item.fonte_label}`,
        `Tema: ${item.titulo} — ${item.subtitulo}`,
        `Possui Fluxograma: ${item.possui_fluxograma ? "Sim (recomendar conferência visual da página original)" : "Não"}`,
        `Conteúdo indexado: ${(item.texto_indexacao || "").slice(0, 1800)}`,
        item.texto_receita_verbatim
          ? `Receita Modelo Verbatim:\n${item.texto_receita_verbatim}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");
    }

    return [
      `[FONTE ${idx + 1}] ${item.fonte_label} (${item.especialidade || "APS"})`,
      `Pergunta: ${item.titulo}`,
      `Resposta Direta: ${item.resposta_direta || ""}`,
      item.conduta_direta?.length ? `Conduta: ${item.conduta_direta.join("; ")}` : "",
      item.prescricao_exames?.length
        ? `Prescrição/Exames: ${item.prescricao_exames.join("; ")}`
        : "",
      item.quando_encaminhar?.length
        ? `Encaminhamento: ${item.quando_encaminhar.join("; ")}`
        : "",
      `Trecho completo: ${(item.texto_completo || "").slice(0, 1800)}`,
    ]
      .filter(Boolean)
      .join("\n");
  });

  const prompt = `Você é um médico assistente de apoio rápido à decisão clínica na Atenção Primária à Saúde (APS / SUS).
Responda à dúvida clínica abaixo cruzando EXCLUSIVAMENTE as fontes recuperadas fornecidas.
REGRAS DE SEGURANÇA CLÍNICA:
1. NÃO invente doses, cortes laboratoriais ou condutas ausentes nas fontes.
2. Quando uma fonte contiver fluxograma, destaque que o médico deve conferir visualmente a imagem original da página citada.
3. Seja extremamente objetivo, escaneável e prático para uso durante consulta rápida.

DÚVIDA CLÍNICA:
${query}

FONTES RECUPERADAS:
${contextBlocks.join("\n\n---\n\n")}

Retorne EXCLUSIVAMENTE um JSON válido neste formato:
{
  "conduta": ["tópico objetivo 1", "tópico objetivo 2"],
  "prescricao_doses": ["fármaco, dose, posologia ou exame conforme as fontes"],
  "red_flags_encaminhamento": ["sinais de alerta ou critérios de encaminhamento citados"],
  "fontes_citadas": ["Manual X v1.5 • Pág. Y", "TelessaúdeRS • DD/MM/AAAA — Título curto"]
}`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      temperature: 0.15,
      responseMimeType: "application/json",
    },
  });

  const parsed = JSON.parse(cleanJsonText(response.text || "{}")) as Partial<ClinicalSynthesis>;
  return {
    conduta: Array.isArray(parsed.conduta) ? parsed.conduta.map(String) : [],
    prescricao_doses: Array.isArray(parsed.prescricao_doses)
      ? parsed.prescricao_doses.map(String)
      : [],
    red_flags_encaminhamento: Array.isArray(parsed.red_flags_encaminhamento)
      ? parsed.red_flags_encaminhamento.map(String)
      : [],
    fontes_citadas: Array.isArray(parsed.fontes_citadas)
      ? parsed.fontes_citadas.map(String)
      : [],
  };
}

export interface StructuredTelessaude {
  especialidade: string;
  resposta_direta: string;
  conduta_direta: string[];
  prescricao_exames: string[];
  quando_encaminhar: string[];
  palavras_chave: string[];
}

export async function structureTelessaudeQuestion(
  titulo: string,
  textoCompleto: string
): Promise<StructuredTelessaude> {
  const ai = getGeminiClient();
  const prompt = `Você é um médico de família estruturando uma Pergunta da Semana do TelessaúdeRS-UFRGS para consulta rápida em consultório de APS.
Baseado EXCLUSIVAMENTE no texto oficial abaixo, retorne JSON válido:
{
  "especialidade": "Especialidade principal",
  "resposta_direta": "Síntese fiel em 1-2 frases",
  "conduta_direta": ["tópico objetivo 1"],
  "prescricao_exames": ["fármacos, doses ou exames citados"],
  "quando_encaminhar": ["critérios de encaminhamento ou red flags"],
  "palavras_chave": ["termos clínicos e medicamentos"]
}

PERGUNTA: ${titulo}
TEXTO OFICIAL:
${textoCompleto.slice(0, 12000)}`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      temperature: 0.1,
      responseMimeType: "application/json",
    },
  });

  const parsed = JSON.parse(cleanJsonText(response.text || "{}")) as Partial<StructuredTelessaude>;
  return {
    especialidade: (parsed.especialidade || "Atenção Primária").trim(),
    resposta_direta: (parsed.resposta_direta || "").trim(),
    conduta_direta: Array.isArray(parsed.conduta_direta)
      ? parsed.conduta_direta.map(String).filter(Boolean)
      : [],
    prescricao_exames: Array.isArray(parsed.prescricao_exames)
      ? parsed.prescricao_exames.map(String).filter(Boolean)
      : [],
    quando_encaminhar: Array.isArray(parsed.quando_encaminhar)
      ? parsed.quando_encaminhar.map(String).filter(Boolean)
      : [],
    palavras_chave: Array.isArray(parsed.palavras_chave)
      ? parsed.palavras_chave.map(String).filter(Boolean).slice(0, 30)
      : [],
  };
}
