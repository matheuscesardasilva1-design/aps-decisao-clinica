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
  return capitulo.trim();
}
