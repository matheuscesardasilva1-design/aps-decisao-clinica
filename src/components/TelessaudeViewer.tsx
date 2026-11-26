"use client";

import * as React from "react";
import {
  ExternalLink,
  CheckCircle2,
  Sparkles,
  Stethoscope,
  Pill,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Loader2,
  BookMarked,
  Table2,
  Copy,
  Check,
} from "lucide-react";
import type { SearchResultItem } from "@/types/clinical";
import { formatDateBR } from "@/lib/utils";

interface TelessaudeViewerProps {
  item: SearchResultItem;
  onMarkAsRead: (id: string) => Promise<void>;
}

export function TelessaudeViewer({ item, onMarkAsRead }: TelessaudeViewerProps) {
  const [marking, setMarking] = React.useState(false);
  const [showRefs, setShowRefs] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    setShowRefs(false);
    setCopied(false);
  }, [item.id]);

  const handleCopySummary = async () => {
    const parts = [
      item.titulo,
      item.resposta_direta ? `Resposta Direta: ${item.resposta_direta}` : "",
      item.conduta_direta?.length ? `Conduta:\n- ${item.conduta_direta.join("\n- ")}` : "",
      item.prescricao_exames?.length
        ? `Prescrição/Exames:\n- ${item.prescricao_exames.join("\n- ")}`
        : "",
      item.quando_encaminhar?.length
        ? `Encaminhamento:\n- ${item.quando_encaminhar.join("\n- ")}`
        : "",
    ].filter(Boolean);
    const text = parts.join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleMarkRead = async () => {
    setMarking(true);
    try {
      await onMarkAsRead(item.id);
    } finally {
      setMarking(false);
    }
  };

  const hasStructured =
    (item.conduta_direta && item.conduta_direta.length > 0) ||
    (item.prescricao_exames && item.prescricao_exames.length > 0) ||
    (item.quando_encaminhar && item.quando_encaminhar.length > 0);

  const hasRichHtml = Boolean(item.conteudo_html && item.conteudo_html.trim().length > 0);
  const hasTable = Boolean(item.conteudo_html && /<table/i.test(item.conteudo_html));

  return (
    <div className="h-full space-y-4 overflow-y-auto pr-1 pb-8">
      {/* Cabeçalho + Resposta Direta */}
      <div className="rounded-xl border border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B] p-5 shadow-sm">
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-md bg-teal-100 dark:bg-teal-900/50 px-2.5 py-0.5 text-xs font-semibold text-[#0D9488] dark:text-teal-300">
              TelessaúdeRS-UFRGS • {formatDateBR(item.data_publicacao)}
            </span>
            {item.especialidade && (
              <span className="inline-flex items-center rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                {item.especialidade}
              </span>
            )}
            {hasTable && (
              <span className="inline-flex items-center gap-1 rounded-md bg-sky-100/80 dark:bg-sky-900/40 px-2 py-0.5 text-[11px] font-semibold text-[#0284C7] dark:text-sky-300">
                <Table2 className="h-3 w-3" />
                Contém Tabela Oficial
              </span>
            )}
            {item.is_new && (
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold uppercase text-emerald-700 dark:text-emerald-300">
                <Sparkles className="h-3 w-3" />
                NOVO
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopySummary}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#0B1120] px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-[#0284C7] transition-colors"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                  Copiado!
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copiar Conduta
                </>
              )}
            </button>
            {item.is_new && (
              <button
                type="button"
                onClick={handleMarkRead}
                disabled={marking}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0D9488] px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 transition-colors disabled:opacity-60"
              >
                {marking ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                Marcar como lida
              </button>
            )}
            {item.url_original && (
              <a
                href={item.url_original}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#0B1120] px-3 py-1.5 text-xs font-medium text-[#0284C7] dark:text-sky-400 hover:border-[#0284C7] transition-colors"
              >
                Fonte Original
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </div>

        <h2 className="text-lg font-semibold leading-snug text-[#0F172A] dark:text-[#F1F5F9]">
          {item.titulo}
        </h2>

        {item.resposta_direta && (
          <div className="mt-3.5 rounded-lg border-l-4 border-[#0D9488] bg-teal-50/70 dark:bg-teal-950/30 p-3.5">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[#0D9488] dark:text-teal-400">
              Resposta Direta
            </span>
            <p className="text-sm leading-relaxed text-slate-800 dark:text-slate-100">
              {item.resposta_direta}
            </p>
          </div>
        )}
      </div>

      {/* Resumo Rápido de Consultório (Card Unificado e Limpo) */}
      {hasStructured && (
        <section className="rounded-xl border border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B] divide-y divide-[#E2E8F0] dark:divide-[#334155] shadow-sm">
          {item.conduta_direta && item.conduta_direta.length > 0 && (
            <div className="p-4">
              <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#0284C7] dark:text-sky-400">
                <Stethoscope className="h-4 w-4" />
                Conduta na APS
              </h3>
              <ul className="space-y-1.5 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                {item.conduta_direta.map((line, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#0284C7]" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {item.prescricao_exames && item.prescricao_exames.length > 0 && (
            <div className="p-4">
              <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#0D9488] dark:text-teal-400">
                <Pill className="h-4 w-4" />
                Prescrição, Doses & Exames
              </h3>
              <ul className="space-y-1.5 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                {item.prescricao_exames.map((line, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#0D9488]" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {item.quando_encaminhar && item.quando_encaminhar.length > 0 && (
            <div className="bg-rose-50/40 dark:bg-rose-950/15 p-4 rounded-b-xl">
              <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400">
                <AlertTriangle className="h-4 w-4" />
                Quando Encaminhar / Red Flags
              </h3>
              <ul className="space-y-1.5 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                {item.quando_encaminhar.map((line, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* Texto Oficial Completo + Tabelas Oficiais (Visível por Padrão) */}
      {(hasRichHtml || item.texto_completo) && (
        <section className="rounded-xl border border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B] p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between border-b border-[#E2E8F0] dark:border-[#334155] pb-2.5">
            <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
              <BookMarked className="h-4 w-4 text-[#0284C7]" />
              Nota Técnica Oficial {hasTable ? "& Tabelas" : "Completa"}
            </h3>
          </div>

          {hasRichHtml ? (
            <div
              className="clinical-html"
              dangerouslySetInnerHTML={{ __html: item.conteudo_html || "" }}
            />
          ) : (
            <div className="whitespace-pre-line text-sm leading-relaxed text-slate-700 dark:text-slate-200">
              {item.texto_completo}
            </div>
          )}
        </section>
      )}

      {/* Referências (Expansível) */}
      {item.referencias && (
        <div className="rounded-xl border border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B]">
          <button
            type="button"
            onClick={() => setShowRefs((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-xl transition-colors"
          >
            <span>Referências Bibliográficas</span>
            {showRefs ? (
              <ChevronUp className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            )}
          </button>

          {showRefs && (
            <div className="border-t border-[#E2E8F0] dark:border-[#334155] p-4">
              <p className="whitespace-pre-line text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                {item.referencias}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
