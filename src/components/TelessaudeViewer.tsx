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
} from "lucide-react";
import type { SearchResultItem } from "@/types/clinical";
import { formatDateBR } from "@/lib/utils";

interface TelessaudeViewerProps {
  item: SearchResultItem;
  onMarkAsRead: (id: string) => Promise<void>;
}

export function TelessaudeViewer({ item, onMarkAsRead }: TelessaudeViewerProps) {
  const [marking, setMarking] = React.useState(false);
  const [showFullText, setShowFullText] = React.useState(false);

  React.useEffect(() => {
    setShowFullText(false);
  }, [item.id]);

  const handleMarkRead = async () => {
    setMarking(true);
    try {
      await onMarkAsRead(item.id);
    } finally {
      setMarking(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto pr-1">
      {/* Cabeçalho */}
      <div className="rounded-xl border border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B] p-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-md bg-teal-100 dark:bg-teal-900/50 px-2.5 py-0.5 text-xs font-semibold text-[#0D9488] dark:text-teal-300">
              TelessaúdeRS-UFRGS • {formatDateBR(item.data_publicacao)}
            </span>
            {item.especialidade && (
              <span className="inline-flex items-center rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                {item.especialidade}
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
          <div className="mt-3 rounded-lg border-l-4 border-[#0D9488] bg-teal-50/70 dark:bg-teal-950/30 p-3.5 text-sm leading-relaxed text-slate-800 dark:text-slate-100">
            {item.resposta_direta}
          </div>
        )}
      </div>

      {/* Blocos Estruturados */}
      <div className="grid grid-cols-1 gap-3">
        {item.conduta_direta && item.conduta_direta.length > 0 && (
          <section className="rounded-xl border border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B] p-4">
            <h3 className="mb-2.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#0284C7] dark:text-sky-400">
              <Stethoscope className="h-4 w-4" />
              Conduta Direta na APS
            </h3>
            <ul className="space-y-1.5 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
              {item.conduta_direta.map((line, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#0284C7]" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {item.prescricao_exames && item.prescricao_exames.length > 0 && (
          <section className="rounded-xl border border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B] p-4">
            <h3 className="mb-2.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#0D9488] dark:text-teal-400">
              <Pill className="h-4 w-4" />
              Prescrição / Exames
            </h3>
            <ul className="space-y-1.5 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
              {item.prescricao_exames.map((line, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#0D9488]" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {item.quando_encaminhar && item.quando_encaminhar.length > 0 && (
          <section className="rounded-xl border border-rose-200/80 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20 p-4">
            <h3 className="mb-2.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400">
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
          </section>
        )}
      </div>

      {/* Texto Completo & Referências (expansível) */}
      {(item.texto_completo || item.referencias) && (
        <div className="rounded-xl border border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B]">
          <button
            type="button"
            onClick={() => setShowFullText((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-xl transition-colors"
          >
            <span className="flex items-center gap-2">
              <BookMarked className="h-4 w-4 text-slate-400" />
              Texto Oficial Completo & Referências
            </span>
            {showFullText ? (
              <ChevronUp className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            )}
          </button>

          {showFullText && (
            <div className="border-t border-[#E2E8F0] dark:border-[#334155] p-4 space-y-4">
              {item.texto_completo && (
                <div className="whitespace-pre-line text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                  {item.texto_completo}
                </div>
              )}
              {item.referencias && (
                <div className="border-t border-[#E2E8F0] dark:border-[#334155] pt-3">
                  <h4 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Referências
                  </h4>
                  <p className="whitespace-pre-line text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                    {item.referencias}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
