export type ManualCategoria =
  | "Adulto APS"
  | "Obstetrícia / Pré-Natal"
  | "Saúde da Criança / Puericultura"
  | "REMUME"
  | "Protocolos";

export type FilterPillKey =
  | "todos"
  | "Adulto APS"
  | "Obstetrícia / Pré-Natal"
  | "Saúde da Criança / Puericultura"
  | "TelessaúdeRS"
  | "novidades"
  | "receita";

export interface SearchResultItem {
  id: string;
  tipo_fonte: "manual_pagina" | "telessaude";
  titulo: string;
  subtitulo: string;
  categoria: string;
  fonte_label: string;
  palavras_chave: string[];
  score: number;

  // Campos de página de Manual PDF
  manual_id: string | null;
  manual_titulo: string | null;
  manual_versao: string | null;
  manual_total_paginas: number | null;
  manual_arquivado: boolean | null;
  numero_pagina: number | null;
  imagem_webp_path: string | null;
  possui_fluxograma: boolean;
  possui_receita_modelo: boolean;
  texto_receita_verbatim: string | null;
  texto_indexacao: string | null;
  chapter_page_count?: number;
  chapter_page_range?: string;

  // Campos de TelessaúdeRS
  url_original: string | null;
  data_publicacao: string | null;
  especialidade: string | null;
  resposta_direta: string | null;
  texto_completo: string | null;
  conteudo_html: string | null;
  conduta_direta: string[] | null;
  prescricao_exames: string[] | null;
  quando_encaminhar: string[] | null;
  referencias: string | null;
  is_new: boolean;
}

export interface ClinicalSynthesis {
  conduta: string[];
  prescricao_doses: string[];
  red_flags_encaminhamento: string[];
  fontes_citadas: string[];
}

export interface ManualRecord {
  id: string;
  titulo: string;
  categoria: ManualCategoria;
  versao: string;
  pdf_storage_path: string | null;
  total_paginas: number;
  paginas_indexadas: number;
  arquivado: boolean;
  created_at: string;
  updated_at: string;
}

export interface SyncLogRecord {
  id: string;
  fonte: string;
  status: "sucesso" | "parcial" | "erro";
  novas_perguntas: number;
  total_verificadas: number;
  mensagem: string | null;
  detalhes_erro: Record<string, unknown> | null;
  executado_em: string;
}
