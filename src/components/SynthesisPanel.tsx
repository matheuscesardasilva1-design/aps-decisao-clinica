"use client";

import * as React from "react";
import {
  Sparkles,
  X,
  Stethoscope,
  Pill,
  AlertTriangle,
  BookOpenCheck,
} from "lucide-react";
import type { ClinicalSynthesis } from "@/types/clinical";

interface SynthesisPanelProps {
  query: string;
  synthesis: ClinicalSynthesis;
  onClose: () => void;
}

export function SynthesisPanel({ query, synthesis, onClose }: SynthesisPanelProps) {
  return (
    <div className="rounded-xl border border-sky-300 dark:border-sky-700/80 bg-gradient-to-br from-sky-50/90 via-white to-teal-50/70 dark:from-sky-950/40 dark:via-[#1E293B] dark:to-teal-950/30 p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#0284C7] dark:text-sky-300">
            <Sparkles className="h-3.5 w-3.5" />
            Síntese Cruzada com IA (Top 5 Fontes)
          </div>
          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
            Consulta: <span className="font-medium">&ldquo;{query}&rdquo;</span> —
            confira sempre os fluxogramas originais nas páginas citadas.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          title="Fechar síntese"
          className="rounded-lg p-1 text-slate-500 hover:bg-slate-200/70 dark:hover:bg-slate-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-[#E2E8F0] dark:border-[#334155] bg-white/90 dark:bg-[#0B1120]/70 p-3">
          <h4 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#0284C7] dark:text-sky-400">
            <Stethoscope className="h-3.5 w-3.5" />
            1. Conduta
          </h4>
          <ul className="space-y-1 text-xs leading-relaxed text-slate-700 dark:text-slate-200">
            {synthesis.conduta.length > 0 ? (
              synthesis.conduta.map((c, i) => <li key={i}>• {c}</li>)
            ) : (
              <li className="text-slate-400">Sem conduta adicional nas fontes.</li>
            )}
          </ul>
        </div>

        <div className="rounded-lg border border-[#E2E8F0] dark:border-[#334155] bg-white/90 dark:bg-[#0B1120]/70 p-3">
          <h4 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#0D9488] dark:text-teal-400">
            <Pill className="h-3.5 w-3.5" />
            2. Prescrição / Doses
          </h4>
          <ul className="space-y-1 text-xs leading-relaxed text-slate-700 dark:text-slate-200">
            {synthesis.prescricao_doses.length > 0 ? (
              synthesis.prescricao_doses.map((p, i) => <li key={i}>• {p}</li>)
            ) : (
              <li className="text-slate-400">Nenhuma dose explícita nas fontes.</li>
            )}
          </ul>
        </div>

        <div className="rounded-lg border border-rose-200/80 dark:border-rose-900/60 bg-white/90 dark:bg-[#0B1120]/70 p-3">
          <h4 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            3. Red Flags / Encaminhamento
          </h4>
          <ul className="space-y-1 text-xs leading-relaxed text-slate-700 dark:text-slate-200">
            {synthesis.red_flags_encaminhamento.length > 0 ? (
              synthesis.red_flags_encaminhamento.map((r, i) => <li key={i}>• {r}</li>)
            ) : (
              <li className="text-slate-400">Sem critérios de alerta citados.</li>
            )}
          </ul>
        </div>

        <div className="rounded-lg border border-[#E2E8F0] dark:border-[#334155] bg-white/90 dark:bg-[#0B1120]/70 p-3">
          <h4 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            <BookOpenCheck className="h-3.5 w-3.5" />
            4. Fontes e Páginas Citadas
          </h4>
          <ul className="space-y-1 text-xs leading-relaxed text-slate-700 dark:text-slate-200">
            {synthesis.fontes_citadas.map((f, i) => (
              <li key={i}>• {f}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
