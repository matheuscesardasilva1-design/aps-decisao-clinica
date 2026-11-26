"use client";

import * as React from "react";
import {
  FileText,
  Sparkles,
  GitBranch,
  ClipboardList,
  BookOpen,
  Archive,
} from "lucide-react";
import type { SearchResultItem } from "@/types/clinical";
import { cn } from "@/lib/utils";

interface ResultCardProps {
  item: SearchResultItem;
  selected: boolean;
  onSelect: (item: SearchResultItem) => void;
}

export function ResultCard({ item, selected, onSelect }: ResultCardProps) {
  const isManual = item.tipo_fonte === "manual_pagina";

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className={cn(
        "w-full text-left rounded-xl border p-3.5 transition-all duration-150 focus:outline-none",
        selected
          ? "border-[#0284C7] bg-sky-50/70 dark:bg-sky-950/30 dark:border-sky-400 shadow-sm ring-1 ring-[#0284C7]/25"
          : "border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B] hover:border-slate-300 dark:hover:border-slate-500"
      )}
    >
      {/* Top Badges Row */}
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium",
            isManual
              ? "bg-sky-100/80 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200"
              : "bg-teal-100/80 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200"
          )}
        >
          {isManual ? (
            <BookOpen className="h-3 w-3 shrink-0" />
          ) : (
            <FileText className="h-3 w-3 shrink-0" />
          )}
          <span className="truncate max-w-[230px]">{item.fonte_label}</span>
        </span>

        {item.is_new && (
          <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/30">
            <Sparkles className="h-2.5 w-2.5" />
            NOVO
          </span>
        )}

        {item.possui_fluxograma && (
          <span className="inline-flex items-center gap-1 rounded-md bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 dark:text-indigo-300">
            <GitBranch className="h-2.5 w-2.5" />
            Fluxograma
          </span>
        )}

        {item.possui_receita_modelo && (
          <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-300">
            <ClipboardList className="h-2.5 w-2.5" />
            Receita
          </span>
        )}

        {item.manual_arquivado && (
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:text-slate-300">
            <Archive className="h-2.5 w-2.5" />
            Arquivado
          </span>
        )}
      </div>

      {/* Title & Subtitle */}
      <h3 className="text-sm font-semibold leading-snug text-[#0F172A] dark:text-[#F1F5F9] line-clamp-2">
        {item.titulo}
      </h3>
      {item.subtitulo && (
        <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400 line-clamp-2">
          {item.subtitulo}
        </p>
      )}

      {/* Clinical Keyword / Drug Tags */}
      {item.palavras_chave && item.palavras_chave.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {item.palavras_chave.slice(0, 5).map((tag, idx) => (
            <span
              key={`${item.id}-tag-${idx}`}
              className="rounded-md bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:text-slate-300"
            >
              {tag}
            </span>
          ))}
          {item.palavras_chave.length > 5 && (
            <span className="rounded-md px-1 py-0.5 text-[10px] text-slate-400">
              +{item.palavras_chave.length - 5}
            </span>
          )}
        </div>
      )}
    </button>
  );
}
