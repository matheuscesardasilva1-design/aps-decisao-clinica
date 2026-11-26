const JUNK_PATTERNS = [
  "aviso etico",
  "aviso juridico",
  "sobre o autor",
  "apresentacao",
  "sumario",
  "indice de ",
  "indice ",
  "capa de secao",
  "capa do modulo",
  "referencias bibliograficas",
  "prefacio",
  "expediente",
  "ficha catalografica",
  "agradecimentos",
  "manual da aps - atencao primaria",
  "doencas cronicas na aps",
  "prevencao de saude",
  "demandas espontaneas",
  "metabolicas e endocrinologicas",
  "doencas respiratorias",
  "cardiologicas e vasculares",
  "doencas cardiovasculares",
  "gastrointestinais",
  "neurologicas e psiquiatricas",
  "musculoesqueleticas",
  "urologicas e renais",
  "dermatologicas",
];

const STOP_WORDS = new Set([
  "de",
  "da",
  "do",
  "das",
  "dos",
  "na",
  "no",
  "nas",
  "nos",
  "em",
  "para",
  "com",
  "por",
  "sobre",
  "aps",
  "sus",
  "atencao",
  "primaria",
  "saude",
  "abordagem",
  "manejo",
  "tratamento",
  "diagnostico",
  "rastreio",
  "rastreamento",
  "adulto",
  "adultos",
  "gestante",
  "nao",
  "tipo",
]);

function stripAccents(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function isNonClinicalFrontMatter(
  capitulo: string | null | undefined,
  subtitulo: string | null | undefined
): boolean {
  const cap = stripAccents(capitulo || "");
  const sub = stripAccents(subtitulo || "");
  const combined = `${cap} ${sub}`.trim();

  if (!cap && !sub) return true;

  if (
    sub.includes("capa de secao") ||
    sub.includes("capa do modulo") ||
    sub.includes("referencias bibliograficas") ||
    sub.startsWith("indice ") ||
    sub.startsWith("sumario ")
  ) {
    return true;
  }

  return JUNK_PATTERNS.some((p) => cap === p || cap.startsWith(p) || combined.includes("sobre o autor"));
}

export function getClinicalTopicKey(manualId: string, capitulo: string): string {
  let clean = stripAccents(capitulo)
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Normalizações de sinônimos frequentes em manuais de APS
  if (clean.includes("pe diabetico")) return `${manualId}::pe_diabetico`;
  if (clean.includes("diabetes") || /\bdm\s*2\b/.test(clean) || /\bdm2\b/.test(clean)) {
    return `${manualId}::diabetes_mellitus`;
  }
  if (clean.includes("hipertensao") || /\bhas\b/.test(clean)) {
    return `${manualId}::hipertensao_arterial`;
  }
  if (clean.includes("hipotireoidismo")) return `${manualId}::hipotireoidismo`;
  if (clean.includes("hipertireoidismo")) return `${manualId}::hipertireoidismo`;
  if (clean.includes("dislipidemia") || clean.includes("risco cardiovascular")) {
    return `${manualId}::dislipidemia_rcv`;
  }
  if (clean.includes("colo do utero") || clean.includes("colo utero") || clean.includes("hpv")) {
    return `${manualId}::cancer_colo_utero`;
  }
  if (clean.includes("cancer de mama")) return `${manualId}::cancer_mama`;
  if (clean.includes("colon e reto") || clean.includes("colorretal")) {
    return `${manualId}::cancer_colorretal`;
  }
  if (clean.includes("vacinacao") || clean.includes("imunizacao") || clean.includes("pni")) {
    return `${manualId}::imunizacao_pni`;
  }
  if (clean.includes("osteoporose") || clean.includes("osteopenia")) {
    return `${manualId}::osteoporose`;
  }
  if (clean.includes("dpoc") || clean.includes("pulmonar obstrutiva")) {
    return `${manualId}::dpoc`;
  }
  if (clean.includes("asma")) {
    return `${manualId}::asma`;
  }

  const significant = clean
    .split(" ")
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

  const stem = significant.slice(0, 2).join("_") || clean.replace(/\s+/g, "_") || "geral";
  return `${manualId}::${stem}`;
}

export function getCleanTopicDisplayTitle(capitulo: string): string {
  const clean = stripAccents(capitulo);
  if (clean.includes("pe diabetico")) return "Pé Diabético";
  if (clean.includes("diabetes") || /\bdm2\b/.test(clean)) return "Diabetes Mellitus Tipo 2";
  if (clean.includes("hipotireoidismo")) return "Hipotireoidismo";
  if (clean.includes("hipertireoidismo")) return "Hipertireoidismo";
  if (clean.includes("dislipidemia") || clean.includes("risco cardiovascular")) {
    return "Dislipidemia e Risco Cardiovascular";
  }
  if (clean.includes("colo do utero") || clean.includes("colo utero")) {
    return "Rastreamento do Câncer de Colo do Útero";
  }
  if (clean.includes("vacinacao") || clean.includes("imunizacao")) {
    return "Imunização e Calendário Vacinal (PNI)";
  }
  if (clean.includes("osteoporose") || clean.includes("osteopenia")) {
    return "Osteopenia e Osteoporose";
  }
  if (clean.includes("dpoc") || clean.includes("pulmonar obstrutiva")) {
    return "DPOC (Doença Pulmonar Obstrutiva Crônica)";
  }
  if (clean.includes("asma")) {
    return "Asma na APS";
  }
  return capitulo.trim();
}

export function inferMedicalSpecialty(
  titulo: string,
  subtitulo?: string | null,
  explicitEspecialidade?: string | null
): string {
  if (explicitEspecialidade && explicitEspecialidade.trim() && explicitEspecialidade !== "Atenção Primária") {
    return explicitEspecialidade.trim();
  }

  const text = stripAccents(`${titulo} ${subtitulo || ""}`);

  if (/diabetes|dm2|pe diabetico|tireoid|hipotireoid|hipertireoid|osteoporos|osteopen|obesidad|vitamina d|dislipid|endocrin/.test(text)) {
    return "Endocrinologia & Metabólicas";
  }
  if (/hipertens|cardio|insuficiencia cardiaca|fibrilac|arritmia|dor toracica|angina|avc|variz|trombos|vascular/.test(text)) {
    return "Cardiologia & Vascular";
  }
  if (/asma|dpoc|pulmon|dispneia|tosse|pneumon|tuberculos|rinite|sinusit|respirat/.test(text)) {
    return "Pneumologia & Respiratórias";
  }
  if (/rastreamento|cancer|vacin|imuniz|pni|prevenc/.test(text)) {
    return "Prevenção & Rastreamento";
  }
  if (/pre-natal|gestant|obstetric|gineco|climat|menopaus|anticoncep|contracep|vulvovag|mama|utero|hpv/.test(text)) {
    return "Saúde da Mulher & Obstetrícia";
  }
  if (/crianc|puericult|pediatr|lactent|aleitament|crescimento|desenvolvimento infantil/.test(text)) {
    return "Saúde da Criança & Puericultura";
  }
  if (/hemorroid|urol|prostat|itu|urinari|renal|nefrol|calculo|incontinencia|proctolog/.test(text)) {
    return "Urologia & Proctologia";
  }
  if (/gastro|refluxo|drge|dispeps|ulcera|diarreia|constipac|hepat|cirros|esteatos|intestin/.test(text)) {
    return "Gastroenterologia";
  }
  if (/depress|ansiedad|insonia|cefaleia|enxaquec|epileps|demenc|parkinson|alzheimer|psiquiat|neurol|tabagism|alcool/.test(text)) {
    return "Saúde Mental & Neurologia";
  }
  if (/dermat|eczema|psorias|acne|micose|escabios|urticaria|pele|ferida/.test(text)) {
    return "Dermatologia";
  }
  if (/lombalg|artrose|artrit|gota|fibromialg|ombro|joelho|ortoped|reumat/.test(text)) {
    return "Ortopedia & Reumatologia";
  }
  if (/otite|vertigem|tontura|faringit|amigdal|conjuntiv|olho|otorrino|oftalm/.test(text)) {
    return "Otorrino & Oftalmologia";
  }
  if (/dengue|hiv|sifilis|ist|infecc|antibiotic|herpes|celulit|erisipela/.test(text)) {
    return "Infectologia";
  }

  return "Clínica Geral / APS";
}

import type { SearchResultItem } from "@/types/clinical";

export function groupManualTopics(rawResults: SearchResultItem[]): SearchResultItem[] {
  const grouped: SearchResultItem[] = [];
  const topicIndexMap = new Map<
    string,
    {
      index: number;
      pages: Set<number>;
      keywords: Set<string>;
      subtitles: Set<string>;
    }
  >();

  for (const item of rawResults) {
    if (item.tipo_fonte !== "manual_pagina" || !item.manual_id) {
      grouped.push(item);
      continue;
    }

    if (isNonClinicalFrontMatter(item.titulo, item.subtitulo)) {
      continue;
    }

    const key = getClinicalTopicKey(item.manual_id, item.titulo || "");
    const existing = topicIndexMap.get(key);

    if (!existing) {
      const pages = new Set<number>();
      if (item.numero_pagina) pages.add(item.numero_pagina);

      const keywords = new Set<string>(item.palavras_chave || []);
      const subtitles = new Set<string>();
      if (item.subtitulo) subtitles.add(item.subtitulo);

      const cleanTitle = getCleanTopicDisplayTitle(item.titulo || "");
      const idx = grouped.length;
      grouped.push({
        ...item,
        titulo: cleanTitle,
        chapter_page_count: pages.size,
        chapter_page_range: item.numero_pagina ? `Pág. ${item.numero_pagina}` : "",
        fonte_label: `${item.categoria} • ${item.numero_pagina ? `Pág. ${item.numero_pagina}` : ""}`,
      });
      topicIndexMap.set(key, { index: idx, pages, keywords, subtitles });
    } else {
      const target = grouped[existing.index];
      if (item.numero_pagina) existing.pages.add(item.numero_pagina);
      (item.palavras_chave || []).forEach((k) => existing.keywords.add(k));
      if (item.subtitulo) existing.subtitles.add(item.subtitulo);

      target.possui_fluxograma = target.possui_fluxograma || item.possui_fluxograma;
      target.possui_receita_modelo =
        target.possui_receita_modelo || item.possui_receita_modelo;
      if (!target.texto_receita_verbatim && item.texto_receita_verbatim) {
        target.texto_receita_verbatim = item.texto_receita_verbatim;
      }
      target.palavras_chave = Array.from(existing.keywords).slice(0, 12);

      const sortedPages = Array.from(existing.pages).sort((a, b) => a - b);
      const minP = sortedPages[0];
      const maxP = sortedPages[sortedPages.length - 1];
      const range =
        sortedPages.length > 1 ? `Págs. ${minP}–${maxP}` : `Pág. ${minP}`;

      target.chapter_page_count = sortedPages.length;
      target.chapter_page_range = range;
      target.fonte_label = `${target.categoria} • ${range}`;
      target.subtitulo = Array.from(existing.subtitles).slice(0, 2).join(" • ");
    }
  }

  return grouped;
}
