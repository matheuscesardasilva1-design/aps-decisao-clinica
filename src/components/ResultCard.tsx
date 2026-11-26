"use client";

import * as React from "react";
import { GitBranch, ClipboardList } from "lucide-react";
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
        "w-full text-left rounded-lg px-3.5 py-3 transition-colors duration-100 focus:outline-none border",
        selected
          ? "border-[#0284C7]/60 bg-sky-50/80 dark:bg-sky-950/40 dark:border-sky-500/50"
          : "border-transparent bg-white dark:bg-[#1E293B] hover:bg-slate-50 dark:hover:bg-slate-800/80 hover:border-[#E2E8F0] dark:hover:border-[#334155]"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3
          className={cn(
            "text-[13px] font-semibold leading-snug line-clamp-2",
            selected
              ? "text-[#0284C7] dark:text-sky-300"
              : "text-[#0F172A] dark:text-[#F1F5F9]"
          )}
        >
          {item.titulo}
        </h3>
        {item.is_new && (
          <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500" title="Novo" />
        )}
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
        <span className="truncate">
          {isManual ? item.fonte_label : item.fonte_label}
        </span>

        <div className="flex shrink-0 items-center gap-1.5">
          {item.possui_fluxograma && (
            <span
              title="Contém fluxograma original"
              className="inline-flex items-center gap-0.5 text-indigo-600 dark:text-indigo-400"
            >
              <GitBranch className="h-3 w-3" />
            </span>
          )}
          {item.possui_receita_modelo && (
            <span
              title="Contém receita modelo"
              className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400"
            >
              <ClipboardList className="h-3 w-3" />
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
