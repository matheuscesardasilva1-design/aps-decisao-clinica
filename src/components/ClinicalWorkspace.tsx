"use client";

import * as React from "react";
import {
  Search,
  Sparkles,
  Loader2,
  ShieldAlert,
  X,
  BookOpen,
  FileSearch,
  SlidersHorizontal,
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
  { key: "Obstetrícia / Pré-Natal", label: "Obstetrícia / Pré-Natal" },
  { key: "TelessaúdeRS", label: "TelessaúdeRS" },
  { key: "novidades", label: "Novidades (Novo)" },
  { key: "receita", label: "Com Modelo de Receita" },
];

export function ClinicalWorkspace() {
  const inputRef = React.useRef<HTMLInputElement>(null);

  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<FilterPillKey>("todos");
  const [includeArchived, setIncludeArchived] = React.useState(false);

  const [results, setResults] = React.useState<SearchResultItem[]>([]);
  const [selectedItem, setSelectedItem] = React.useState<SearchResultItem | null>(
    null
  );
  const [mobileDrawerOpen, setMobileDrawerOpen] = React.useState(false);

  const [loading, setLoading] = React.useState(true);
  const [searchMeta, setSearchMeta] = React.useState<{
    count: number;
    elapsedMs: number;
    semanticActive: boolean;
  } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const [navigatingPage, setNavigatingPage] = React.useState(false);

  const [synthesizing, setSynthesizing] = React.useState(false);
  const [synthesis, setSynthesis] = React.useState<ClinicalSynthesis | null>(null);
  const [synthesisError, setSynthesisError] = React.useState<string | null>(null);

  // Atalho global Ctrl+K / Cmd+K e foco automático ao abrir
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

  // Busca híbrida com debounce rápido (260ms)
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
            includeArchived,
            limit: 25,
          }),
          signal: controller.signal,
        });

        const data = (await res.json()) as {
          results?: SearchResultItem[];
          meta?: { count: number; elapsedMs: number; semanticActive: boolean };
          error?: string;
        };

        if (!res.ok) {
          throw new Error(data.error || "Erro na busca clínica.");
        }

        const list = data.results || [];
        setResults(list);
        setSearchMeta(data.meta || null);

        // Mantém item selecionado se ainda existir na lista, senão seleciona o primeiro no desktop
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
    }, query.trim() ? 260 : 0);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, filter, includeArchived]);

  const handleSelectItem = (item: SearchResultItem) => {
    setSelectedItem(item);
    setMobileDrawerOpen(true);
  };

  const handleNavigatePage = async (manualId: string, nextPage: number) => {
    setNavigatingPage(true);
    try {
      const res = await fetch(
        `/api/manual-page?manualId=${encodeURIComponent(manualId)}&page=${nextPage}`
      );
      const data = (await res.json()) as { item?: SearchResultItem; error?: string };
      if (res.ok && data.item) {
        setSelectedItem(data.item);
      }
    } finally {
      setNavigatingPage(false);
    }
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
    <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-4 px-4 py-4 sm:px-6">
      {/* Barra de Busca Central + LGPD + Filtros */}
      <section className="rounded-2xl border border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B] p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#0284C7]" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar conduta, fármaco, sintoma, CID ou protocolo (ex: hipertensão refratária, ITU gestante, losartana)..."
              className="w-full rounded-xl border border-[#E2E8F0] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#0B1120] py-3 pl-10 pr-24 text-sm text-[#0F172A] dark:text-[#F1F5F9] placeholder:text-slate-400 focus:border-[#0284C7] focus:outline-none focus:ring-2 focus:ring-sky-500/20"
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
                  className="rounded-md p-1 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              <kbd className="hidden sm:inline-flex items-center rounded-md border border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B] px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-500 dark:text-slate-400">
                ⌘K / Ctrl+K
              </kbd>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSynthesize}
            disabled={synthesizing || !query.trim() || results.length === 0}
            title="Cruza os 5 principais resultados (Manuais + TelessaúdeRS) em 4 blocos objetivos"
            className="inline-flex h-[46px] shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0284C7] to-[#0D9488] px-4 text-xs font-semibold text-white shadow-sm hover:opacity-95 transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
          >
            {synthesizing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Cruzando fontes...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Cruzar Fontes com IA
              </>
            )}
          </button>
        </div>

        {/* Aviso Discreto LGPD + Metadados de Busca */}
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
          <div
            className="inline-flex items-center gap-1.5"
            title="Conformidade LGPD: Utilize termos clínicos genéricos. Nunca digite nome, CPF, CNS ou dados identificáveis de pacientes."
          >
            <ShieldAlert className="h-3.5 w-3.5 text-[#0D9488] shrink-0" />
            <span>
              <strong>LGPD:</strong> Não insira dados identificáveis de pacientes
              (nome, CPF, CNS). Uso exclusivo para consulta clínica genérica.
            </span>
          </div>

          <div className="flex items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-1.5 select-none">
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(e) => setIncludeArchived(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-[#0284C7] focus:ring-sky-500"
              />
              <span className="inline-flex items-center gap-1">
                <SlidersHorizontal className="h-3 w-3" />
                Incluir versões arquivadas
              </span>
            </label>

            {searchMeta && !loading && (
              <span className="hidden sm:inline text-slate-400 dark:text-slate-500">
                {searchMeta.count} resultado(s) em {searchMeta.elapsedMs}ms
                {searchMeta.semanticActive ? " • Híbrida (FTS + Vetor)" : " • FTS"}
              </span>
            )}
          </div>
        </div>

        {/* Pílulas de Filtro Rápido */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {FILTER_PILLS.map((pill) => {
            const active = filter === pill.key;
            return (
              <button
                key={pill.key}
                type="button"
                onClick={() => setFilter(pill.key)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  active
                    ? "bg-[#0284C7] text-white shadow-sm"
                    : "border border-[#E2E8F0] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#0B1120] text-slate-700 dark:text-slate-300 hover:border-[#0284C7] dark:hover:border-sky-400"
                )}
              >
                {pill.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Painel de Síntese Cruzada Sob Demanda */}
      {synthesisError && (
        <div className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-4 py-3 text-xs text-rose-700 dark:text-rose-300">
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

      {/* Split-View Responsivo: Lista à Esquerda + Visualizador Clínico à Direita */}
      <section className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-12 min-h-[calc(100vh-290px)]">
        {/* Coluna Esquerda: Resultados */}
        <div className="flex flex-col gap-2.5 lg:col-span-4 xl:col-span-4 lg:max-h-[calc(100vh-270px)] lg:overflow-y-auto lg:pr-1">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B] py-16 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin text-[#0284C7]" />
              <span className="text-xs">Consultando manuais e TelessaúdeRS...</span>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 p-4 text-xs text-rose-700 dark:text-rose-300">
              {error}
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#E2E8F0] dark:border-[#334155] bg-white/60 dark:bg-[#1E293B]/60 p-10 text-center">
              <FileSearch className="h-8 w-8 text-slate-400" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Nenhum resultado encontrado
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tente termos clínicos alternativos, remova filtros ou indexe seus
                manuais na aba Admin.
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

        {/* Coluna Direita (Desktop): Visualizador Clínico */}
        <div className="hidden lg:flex lg:col-span-8 xl:col-span-8 lg:max-h-[calc(100vh-270px)] flex-col">
          {selectedItem ? (
            selectedItem.tipo_fonte === "manual_pagina" ? (
              <ManualPageViewer
                item={selectedItem}
                onNavigatePage={handleNavigatePage}
                navigating={navigatingPage}
              />
            ) : (
              <TelessaudeViewer
                item={selectedItem}
                onMarkAsRead={handleMarkAsRead}
              />
            )
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[#E2E8F0] dark:border-[#334155] bg-white/50 dark:bg-[#1E293B]/40 p-12 text-center">
              <BookOpen className="h-10 w-10 text-slate-300 dark:text-slate-600" />
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                Selecione um resultado à esquerda
              </p>
              <p className="max-w-md text-xs text-slate-500 dark:text-slate-400">
                Páginas de manuais abrem diretamente na imagem WebP original em alta
                nitidez (zero alucinação em fluxogramas), e perguntas do TelessaúdeRS
                exibem a conduta estruturada em tópicos.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Drawer / Modal Responsivo para Mobile (< lg) */}
      {mobileDrawerOpen && selectedItem && (
        <div className="fixed inset-0 z-40 flex flex-col bg-[#F8FAFC] dark:bg-[#0B1120] lg:hidden">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B] px-4 py-3">
            <span className="truncate text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
              {selectedItem.fonte_label}
            </span>
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(false)}
              className="inline-flex items-center gap-1 rounded-lg border border-[#E2E8F0] dark:border-[#334155] px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200"
            >
              <X className="h-3.5 w-3.5" />
              Voltar
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {selectedItem.tipo_fonte === "manual_pagina" ? (
              <ManualPageViewer
                item={selectedItem}
                onNavigatePage={handleNavigatePage}
                navigating={navigatingPage}
              />
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
