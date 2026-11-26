"use client";

import * as React from "react";
import {
  Search,
  Sparkles,
  Loader2,
  ShieldCheck,
  X,
  ArrowLeft,
  GitBranch,
  ClipboardList,
  ChevronRight,
  FileSearch,
  BookOpen,
  Newspaper,
} from "lucide-react";
import type {
  ClinicalSynthesis,
  FilterPillKey,
  SearchResultItem,
} from "@/types/clinical";
import { ManualPageViewer } from "@/components/ManualPageViewer";
import { TelessaudeViewer } from "@/components/TelessaudeViewer";
import { SynthesisPanel } from "@/components/SynthesisPanel";
import { cn } from "@/lib/utils";

const FILTER_TABS: { key: FilterPillKey; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "Adulto APS", label: "Adulto APS" },
  { key: "Obstetrícia / Pré-Natal", label: "Saúde da Mulher" },
  { key: "TelessaúdeRS", label: "TelessaúdeRS" },
  { key: "receita", label: "Receitas" },
];

const QUICK_SUGGESTIONS = [
  "Diabetes",
  "Asma",
  "DPOC",
  "Hipotireoidismo",
  "Osteoporose",
  "Vitamina D",
];

export function ClinicalWorkspace() {
  const inputRef = React.useRef<HTMLInputElement>(null);

  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<FilterPillKey>("todos");

  const [results, setResults] = React.useState<SearchResultItem[]>([]);
  const [selectedItem, setSelectedItem] = React.useState<SearchResultItem | null>(
    null
  );

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [synthesizing, setSynthesizing] = React.useState(false);
  const [synthesis, setSynthesis] = React.useState<ClinicalSynthesis | null>(null);
  const [synthesisError, setSynthesisError] = React.useState<string | null>(null);

  // Atalho global Ctrl+K / Cmd+K
  React.useEffect(() => {
    inputRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSelectedItem(null);
        setTimeout(() => {
          inputRef.current?.focus();
          inputRef.current?.select();
        }, 20);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Busca híbrida
  React.useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      setSynthesis(null);
      setSynthesisError(null);

      try {
        const res = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query,
            filter,
            includeArchived: false,
            limit: 25,
          }),
          signal: controller.signal,
        });

        const data = (await res.json()) as {
          results?: SearchResultItem[];
          error?: string;
        };

        if (!res.ok) {
          throw new Error(data.error || "Erro na busca clínica.");
        }

        setResults(data.results || []);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError(
          err instanceof Error ? err.message : "Falha de comunicação com o servidor."
        );
      } finally {
        setLoading(false);
      }
    }, query.trim() ? 220 : 0);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, filter]);

  const handleMarkAsRead = async (id: string) => {
    const res = await fetch(`/api/telessaude/${encodeURIComponent(id)}/read`, {
      method: "PATCH",
    });
    if (res.ok) {
      setResults((prev) =>
        prev.map((item) => (item.id === id ? { ...item, is_new: false } : item))
      );
      setSelectedItem((prev) =>
        prev && prev.id === id ? { ...prev, is_new: false } : prev
      );
    }
  };

  const handleSynthesize = async () => {
    if (!query.trim() || results.length === 0) return;
    setSynthesizing(true);
    setSynthesisError(null);
    try {
      const res = await fetch("/api/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: query.trim(),
          sources: results.slice(0, 5),
        }),
      });
      const data = (await res.json()) as {
        synthesis?: ClinicalSynthesis;
        error?: string;
      };
      if (!res.ok || !data.synthesis) {
        throw new Error(data.error || "Erro ao cruzar fontes com IA.");
      }
      setSynthesis(data.synthesis);
    } catch (err) {
      setSynthesisError(
        err instanceof Error ? err.message : "Erro ao gerar síntese."
      );
    } finally {
      setSynthesizing(false);
    }
  };

  // ===========================================================================
  // MODO LEITURA FOCADA
  // ===========================================================================
  if (selectedItem) {
    return (
      <main className="animate-fade-in mx-auto flex w-full max-w-4xl flex-1 flex-col gap-5 px-4 py-6 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setSelectedItem(null)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 ring-1 ring-black/[0.08] dark:ring-white/[0.1] hover:ring-sky-500/50 hover:text-sky-700 dark:hover:text-sky-300 transition-all"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedItem(null);
              setTimeout(() => {
                inputRef.current?.focus();
                inputRef.current?.select();
              }, 20);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 transition-colors"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Nova consulta</span>
            <kbd className="rounded bg-black/[0.05] dark:bg-white/[0.08] px-1.5 py-0.5 font-mono text-[10px]">
              ⌘K
            </kbd>
          </button>
        </div>

        <div className="flex-1">
          {selectedItem.tipo_fonte === "manual_pagina" ? (
            <ManualPageViewer item={selectedItem} />
          ) : (
            <TelessaudeViewer
              item={selectedItem}
              onMarkAsRead={handleMarkAsRead}
            />
          )}
        </div>
      </main>
    );
  }

  // ===========================================================================
  // TELA INICIAL — ESTILO EDITORIAL / COMMAND PALETTE (IMPECCABLE CRAFT)
  // ===========================================================================
  return (
    <main className="animate-fade-in mx-auto flex w-full max-w-3xl flex-1 flex-col gap-7 px-4 py-10 sm:px-6 sm:py-14">
      {/* Cabeçalho Editorial */}
      <section className="space-y-4">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-teal-700 dark:text-teal-400">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
            Base Privada • Atenção Primária à Saúde
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 sm:text-[28px]">
            Consulta Rápida em Consultório
          </h1>
        </div>

        {/* Barra de Busca Elevada */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar doença, sintoma, fármaco ou protocolo..."
              className="w-full rounded-2xl bg-[var(--surface-card)] py-3.5 pl-11 pr-24 text-[15px] text-slate-900 dark:text-slate-50 placeholder:text-slate-400 ring-1 ring-black/[0.09] dark:ring-white/[0.1] shadow-[0_2px_12px_rgba(15,23,42,0.04)] dark:shadow-none focus:outline-none focus:ring-2 focus:ring-sky-600/70 dark:focus:ring-sky-400/70 transition-all"
            />
            <div className="absolute right-3.5 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    inputRef.current?.focus();
                  }}
                  aria-label="Limpar busca"
                  className="rounded-md p-1 text-slate-400 hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              <span
                title="LGPD: Não digite nome, CPF ou CNS de pacientes. Uso exclusivo para consulta clínica genérica."
                className="cursor-help p-1 text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
              >
                <ShieldCheck className="h-4 w-4" />
              </span>
              <kbd className="hidden sm:inline-flex items-center rounded-md bg-black/[0.04] dark:bg-white/[0.07] px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-500 dark:text-slate-400">
                ⌘K
              </kbd>
            </div>
          </div>

          {query.trim().length > 0 && results.length > 0 && (
            <button
              type="button"
              onClick={handleSynthesize}
              disabled={synthesizing}
              className="inline-flex h-[50px] shrink-0 items-center gap-1.5 rounded-2xl bg-slate-900 dark:bg-sky-500 px-4 text-xs font-semibold text-white dark:text-slate-950 shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {synthesizing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">Resumir (IA)</span>
            </button>
          )}
        </div>

        {/* Sugestões Rápidas discretas (quando busca está vazia) */}
        {!query.trim() && (
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <span className="text-[11px] text-slate-400 mr-1">Acesso rápido:</span>
            {QUICK_SUGGESTIONS.map((term) => (
              <button
                key={term}
                type="button"
                onClick={() => setQuery(term)}
                className="rounded-full bg-black/[0.035] dark:bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-sky-500/10 hover:text-sky-700 dark:hover:text-sky-300 transition-colors"
              >
                {term}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Síntese Sob Demanda */}
      {synthesisError && (
        <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 px-4 py-3 text-xs text-rose-700 dark:text-rose-300 ring-1 ring-rose-500/20">
          {synthesisError}
        </div>
      )}
      {synthesis && (
        <SynthesisPanel
          query={query}
          synthesis={synthesis}
          onClose={() => setSynthesis(null)}
        />
      )}

      {/* Barra Segmentada de Filtros + Lista Editorial Limpa */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2 overflow-x-auto pb-0.5">
          <div className="inline-flex items-center rounded-xl bg-black/[0.04] dark:bg-white/[0.05] p-1">
            {FILTER_TABS.map((tab) => {
              const active = filter === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setFilter(tab.key)}
                  className={cn(
                    "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                    active
                      ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                  )}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {!loading && (
            <span className="hidden sm:inline text-[11px] font-mono text-slate-400">
              {results.length} {results.length === 1 ? "tema" : "temas"}
            </span>
          )}
        </div>

        {/* Lista Editorial com Divisores Finos */}
        <div className="overflow-hidden rounded-2xl bg-[var(--surface-card)] ring-1 ring-black/[0.07] dark:ring-white/[0.08] shadow-[0_1px_4px_rgba(15,23,42,0.03)] dark:shadow-none">
          {loading ? (
            <div className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
              {[1, 2, 3, 4, 5].map((n) => (
                <div key={n} className="flex items-center justify-between px-4 py-4">
                  <div className="space-y-2 flex-1">
                    <div className="h-3.5 w-2/5 animate-pulse rounded bg-slate-200/80 dark:bg-slate-700/60" />
                    <div className="h-2.5 w-1/4 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                  </div>
                  <div className="h-3 w-16 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="p-6 text-center text-xs text-rose-600 dark:text-rose-400">
              {error}
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <FileSearch className="h-6 w-6 text-slate-300 dark:text-slate-600" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Nenhum protocolo encontrado
              </p>
              <p className="text-xs text-slate-400">
                Tente buscar outro termo clínico ou volte para o filtro &ldquo;Todos&rdquo;.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
              {results.map((item) => {
                const isManual = item.tipo_fonte === "manual_pagina";
                return (
                  <button
                    key={`${item.tipo_fonte}-${item.id}`}
                    type="button"
                    onClick={() => setSelectedItem(item)}
                    className="group flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left transition-colors hover:bg-slate-50/90 dark:hover:bg-white/[0.03] focus:bg-slate-50 dark:focus:bg-white/[0.04] focus:outline-none"
                  >
                    <div className="flex min-w-0 items-center gap-3.5">
                      <div
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                          isManual
                            ? "bg-sky-500/10 text-sky-700 dark:text-sky-400"
                            : "bg-teal-500/10 text-teal-700 dark:text-teal-400"
                        )}
                      >
                        {isManual ? (
                          <BookOpen className="h-4 w-4" />
                        ) : (
                          <Newspaper className="h-4 w-4" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[14px] font-medium text-slate-900 dark:text-slate-100 group-hover:text-sky-700 dark:group-hover:text-sky-300 transition-colors">
                            {item.titulo}
                          </span>
                          {item.is_new && (
                            <span className="inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" />
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-[12px] text-slate-500 dark:text-slate-400">
                          {item.fonte_label}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2.5">
                      {item.possui_fluxograma && (
                        <span
                          title="Contém fluxograma original"
                          className="inline-flex items-center gap-1 rounded-md bg-black/[0.035] dark:bg-white/[0.06] px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300"
                        >
                          <GitBranch className="h-3 w-3 text-indigo-500" />
                          <span className="hidden sm:inline">Fluxo</span>
                        </span>
                      )}
                      {item.possui_receita_modelo && (
                        <span
                          title="Contém modelo de receita"
                          className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300"
                        >
                          <ClipboardList className="h-3 w-3" />
                          <span className="hidden sm:inline">Receita</span>
                        </span>
                      )}
                      <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600 group-hover:translate-x-0.5 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-all" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
