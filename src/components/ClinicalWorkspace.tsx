"use client";

import * as React from "react";
import {
  Search,
  Sparkles,
  Loader2,
  ShieldCheck,
  X,
  BookOpen,
  FileSearch,
} from "lucide-react";
import type {
  ClinicalSynthesis,
  FilterPillKey,
  SearchResultItem,
} from "@/types/clinical";
import { ResultCard } from "@/components/ResultCard";
import { ManualPageViewer } from "@/components/ManualPageViewer";
import { TelessaudeViewer } from "@/components/TelessaudeViewer";
import { SynthesisPanel } from "@/components/SynthesisPanel";
import { cn } from "@/lib/utils";

const FILTER_PILLS: { key: FilterPillKey; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "Adulto APS", label: "Adulto APS" },
  { key: "Obstetrícia / Pré-Natal", label: "Obstetrícia" },
  { key: "TelessaúdeRS", label: "TelessaúdeRS" },
  { key: "novidades", label: "Novidades" },
  { key: "receita", label: "Receitas" },
];

export function ClinicalWorkspace() {
  const inputRef = React.useRef<HTMLInputElement>(null);

  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<FilterPillKey>("todos");

  const [results, setResults] = React.useState<SearchResultItem[]>([]);
  const [selectedItem, setSelectedItem] = React.useState<SearchResultItem | null>(
    null
  );
  const [mobileDrawerOpen, setMobileDrawerOpen] = React.useState(false);

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
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Busca híbrida com debounce
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
            limit: 30,
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

        const list = data.results || [];
        setResults(list);

        setSelectedItem((prev) => {
          if (prev && list.some((item) => item.id === prev.id)) {
            return prev;
          }
          return list[0] ?? null;
        });
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError(
          err instanceof Error ? err.message : "Falha de comunicação com o servidor."
        );
      } finally {
        setLoading(false);
      }
    }, query.trim() ? 240 : 0);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, filter]);

  const handleSelectItem = (item: SearchResultItem) => {
    setSelectedItem(item);
    setMobileDrawerOpen(true);
  };

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

  return (
    <main className="mx-auto flex w-full max-w-[1520px] flex-1 flex-col gap-4 px-4 py-4 sm:px-6">
      {/* Barra Superior Minimalista */}
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2.5">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar condição, fármaco ou protocolo (ex: diabetes, hipotireoidismo, vitamina D)..."
              className="w-full rounded-xl border border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B] py-2.5 pl-10 pr-24 text-sm text-[#0F172A] dark:text-[#F1F5F9] placeholder:text-slate-400 shadow-sm focus:border-[#0284C7] focus:outline-none focus:ring-2 focus:ring-sky-500/15"
            />
            <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    inputRef.current?.focus();
                  }}
                  title="Limpar busca"
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              <span
                title="LGPD: Não insira nome, CPF ou CNS de pacientes. Uso exclusivo para consulta clínica genérica."
                className="cursor-help text-slate-400 hover:text-[#0D9488]"
              >
                <ShieldCheck className="h-4 w-4" />
              </span>
              <kbd className="hidden sm:inline-flex items-center rounded border border-[#E2E8F0] dark:border-[#334155] px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                ⌘K
              </kbd>
            </div>
          </div>

          {query.trim().length > 0 && results.length > 0 && (
            <button
              type="button"
              onClick={handleSynthesize}
              disabled={synthesizing}
              className="inline-flex h-[42px] shrink-0 items-center gap-1.5 rounded-xl bg-[#0284C7] px-3.5 text-xs font-semibold text-white shadow-sm hover:bg-sky-700 transition-colors disabled:opacity-50"
            >
              {synthesizing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">Cruzar Fontes (IA)</span>
            </button>
          )}
        </div>

        {/* Filtros Limpos em Linha Única */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {FILTER_PILLS.map((pill) => {
            const active = filter === pill.key;
            return (
              <button
                key={pill.key}
                type="button"
                onClick={() => setFilter(pill.key)}
                className={cn(
                  "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "bg-[#0F172A] text-white dark:bg-sky-500 dark:text-slate-950"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800"
                )}
              >
                {pill.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Síntese Cruzada Sob Demanda */}
      {synthesisError && (
        <div className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-4 py-2.5 text-xs text-rose-700 dark:text-rose-300">
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

      {/* Split-View Limpo */}
      <section className="grid flex-1 grid-cols-1 gap-5 lg:grid-cols-12 min-h-[calc(100vh-200px)]">
        {/* Lista Esquerda: Temas Agrupados */}
        <div className="flex flex-col gap-1 lg:col-span-4 xl:col-span-3 lg:max-h-[calc(100vh-185px)] lg:overflow-y-auto lg:pr-1">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-xs text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin text-[#0284C7]" />
              Buscando...
            </div>
          ) : error ? (
            <div className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 p-3.5 text-xs text-rose-700 dark:text-rose-300">
              {error}
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
              <FileSearch className="h-6 w-6 text-slate-300 dark:text-slate-600" />
              <p className="text-xs font-medium text-slate-500">
                Nenhum tema encontrado
              </p>
            </div>
          ) : (
            results.map((item) => (
              <ResultCard
                key={`${item.tipo_fonte}-${item.id}`}
                item={item}
                selected={selectedItem?.id === item.id}
                onSelect={handleSelectItem}
              />
            ))
          )}
        </div>

        {/* Painel Direito: Protocolo Clínico Completo */}
        <div className="hidden lg:block lg:col-span-8 xl:col-span-9 lg:max-h-[calc(100vh-185px)]">
          {selectedItem ? (
            selectedItem.tipo_fonte === "manual_pagina" ? (
              <ManualPageViewer item={selectedItem} />
            ) : (
              <TelessaudeViewer
                item={selectedItem}
                onMarkAsRead={handleMarkAsRead}
              />
            )
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[#E2E8F0] dark:border-[#334155] p-12 text-center">
              <BookOpen className="h-8 w-8 text-slate-300 dark:text-slate-600" />
              <p className="text-sm font-medium text-slate-500">
                Selecione um tema clínico à esquerda
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Drawer Mobile */}
      {mobileDrawerOpen && selectedItem && (
        <div className="fixed inset-0 z-40 flex flex-col bg-[#F8FAFC] dark:bg-[#0B1120] lg:hidden">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B] px-4 py-3">
            <span className="truncate text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
              {selectedItem.titulo}
            </span>
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(false)}
              className="inline-flex items-center gap-1 rounded-lg border border-[#E2E8F0] dark:border-[#334155] px-2.5 py-1 text-xs font-medium"
            >
              <X className="h-3.5 w-3.5" />
              Voltar
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {selectedItem.tipo_fonte === "manual_pagina" ? (
              <ManualPageViewer item={selectedItem} />
            ) : (
              <TelessaudeViewer
                item={selectedItem}
                onMarkAsRead={handleMarkAsRead}
              />
            )}
          </div>
        </div>
      )}
    </main>
  );
}
