"use client";

import * as React from "react";
import {
  Search,
  Sparkles,
  Loader2,
  ShieldCheck,
  X,
  ArrowLeft,
  BookOpen,
  Baby,
  Newspaper,
  ClipboardList,
  GitBranch,
  ChevronRight,
  FileSearch,
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

const QUICK_CATEGORIES: {
  key: FilterPillKey;
  label: string;
  desc: string;
  icon: React.ElementType;
  color: string;
}[] = [
  {
    key: "Adulto APS",
    label: "Adulto APS",
    desc: "Crônicas, fluxogramas e condutas",
    icon: BookOpen,
    color: "text-[#0284C7] bg-sky-50 dark:bg-sky-950/60 dark:text-sky-400",
  },
  {
    key: "Obstetrícia / Pré-Natal",
    label: "Saúde da Mulher",
    desc: "Pré-natal, gineco e puericultura",
    icon: Baby,
    color: "text-pink-600 bg-pink-50 dark:bg-pink-950/50 dark:text-pink-400",
  },
  {
    key: "TelessaúdeRS",
    label: "TelessaúdeRS",
    desc: "Perguntas da Semana atualizadas",
    icon: Newspaper,
    color: "text-[#0D9488] bg-teal-50 dark:bg-teal-950/60 dark:text-teal-400",
  },
  {
    key: "receita",
    label: "Receitas Modelo",
    desc: "Prescrições prontas para copiar",
    icon: ClipboardList,
    color: "text-amber-600 bg-amber-50 dark:bg-amber-950/50 dark:text-amber-400",
  },
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

  // Atalho global Ctrl+K / Cmd+K e ESC para voltar
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
            limit: 24,
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
    }, query.trim() ? 240 : 0);

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
  // MODO LEITURA FOCADA (quando um protocolo ou pergunta está aberto)
  // ===========================================================================
  if (selectedItem) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-4 py-5 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setSelectedItem(null)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B] px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-[#0284C7] hover:text-[#0284C7] transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar à busca
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedItem(null);
              setTimeout(() => inputRef.current?.focus(), 20);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <Search className="h-3.5 w-3.5" />
            Nova busca (⌘K)
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
  // MODO INÍCIO / BUSCA SPOTLIGHT (limpo, espaçoso, estilo app clínico moderno)
  // ===========================================================================
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10">
      {/* Hero + Barra de Busca Central */}
      <section className="mx-auto flex w-full max-w-2xl flex-col items-center text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-[#0F172A] dark:text-[#F1F5F9] sm:text-3xl">
          O que você precisa consultar agora?
        </h1>
        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
          Protocolos da APS, fluxogramas originais e TelessaúdeRS-UFRGS em um só lugar.
        </p>

        <div className="mt-5 flex w-full items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ex: diabetes, hipotireoidismo, asma, vitamina D, tosse crônica..."
              className="w-full rounded-2xl border border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B] py-3.5 pl-11 pr-24 text-sm text-[#0F172A] dark:text-[#F1F5F9] placeholder:text-slate-400 shadow-sm focus:border-[#0284C7] focus:outline-none focus:ring-4 focus:ring-sky-500/10 transition-all"
            />
            <div className="absolute right-3.5 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    inputRef.current?.focus();
                  }}
                  className="rounded-md p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              <span
                title="LGPD: Não digite nome, CPF ou CNS de pacientes."
                className="cursor-help text-slate-400 hover:text-[#0D9488]"
              >
                <ShieldCheck className="h-4 w-4" />
              </span>
              <kbd className="hidden sm:inline-flex items-center rounded-md border border-[#E2E8F0] dark:border-[#334155] bg-slate-50 dark:bg-[#0B1120] px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                ⌘K
              </kbd>
            </div>
          </div>

          {query.trim().length > 0 && results.length > 0 && (
            <button
              type="button"
              onClick={handleSynthesize}
              disabled={synthesizing}
              className="inline-flex h-[50px] shrink-0 items-center gap-1.5 rounded-2xl bg-[#0284C7] px-4 text-xs font-semibold text-white shadow-sm hover:bg-sky-700 transition-colors disabled:opacity-50"
            >
              {synthesizing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">Resumir com IA</span>
            </button>
          )}
        </div>
      </section>

      {/* Atalhos Visuais de Categorias (4 Cards Limpos) */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {QUICK_CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const active = filter === cat.key;
          return (
            <button
              key={cat.key}
              type="button"
              onClick={() => setFilter(active ? "todos" : cat.key)}
              className={cn(
                "flex flex-col items-start rounded-2xl border p-4 text-left transition-all",
                active
                  ? "border-[#0284C7] bg-sky-50/50 dark:bg-sky-950/30 ring-2 ring-[#0284C7]/20"
                  : "border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B] hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-sm"
              )}
            >
              <div className={cn("mb-3 flex h-9 w-9 items-center justify-center rounded-xl", cat.color)}>
                <Icon className="h-4 w-4" />
              </div>
              <span className="text-sm font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                {cat.label}
              </span>
              <span className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                {cat.desc}
              </span>
            </button>
          );
        })}
      </section>

      {/* Síntese Sob Demanda */}
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

      {/* Grade Limpa de Temas Clínicos */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            {query.trim()
              ? `Resultados para "${query.trim()}"`
              : filter === "todos"
                ? "Protocolos e Condutas Disponíveis"
                : `Filtrado por: ${filter}`}
          </h2>
          {filter !== "todos" && (
            <button
              type="button"
              onClick={() => setFilter("todos")}
              className="text-xs font-medium text-[#0284C7] hover:underline"
            >
              Ver todos
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-xs text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin text-[#0284C7]" />
            Carregando protocolos...
          </div>
        ) : error ? (
          <div className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 p-4 text-xs text-rose-700 dark:text-rose-300">
            {error}
          </div>
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[#E2E8F0] dark:border-[#334155] py-16 text-center">
            <FileSearch className="h-7 w-7 text-slate-300 dark:text-slate-600" />
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
              Nenhum protocolo encontrado
            </p>
            <p className="text-xs text-slate-400">
              Tente outro termo clínico ou limpe o filtro ativo.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((item) => {
              const isManual = item.tipo_fonte === "manual_pagina";
              return (
                <button
                  key={`${item.tipo_fonte}-${item.id}`}
                  type="button"
                  onClick={() => setSelectedItem(item)}
                  className="group flex flex-col justify-between rounded-xl border border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B] p-4 text-left transition-all hover:border-[#0284C7]/60 hover:shadow-sm focus:outline-none"
                >
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          "text-[11px] font-medium",
                          isManual
                            ? "text-[#0284C7] dark:text-sky-400"
                            : "text-[#0D9488] dark:text-teal-400"
                        )}
                      >
                        {item.categoria}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {item.is_new && (
                          <span className="h-2 w-2 rounded-full bg-emerald-500" title="Novo" />
                        )}
                        {item.possui_fluxograma && (
                          <GitBranch
                            className="h-3.5 w-3.5 text-indigo-500"
                            aria-label="Possui fluxograma"
                          />
                        )}
                        {item.possui_receita_modelo && (
                          <ClipboardList
                            className="h-3.5 w-3.5 text-amber-500"
                            aria-label="Possui receita modelo"
                          />
                        )}
                      </div>
                    </div>

                    <h3 className="text-sm font-semibold leading-snug text-[#0F172A] dark:text-[#F1F5F9] group-hover:text-[#0284C7] dark:group-hover:text-sky-300 transition-colors line-clamp-2">
                      {item.titulo}
                    </h3>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
                    <span className="truncate">{item.fonte_label}</span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-[#0284C7]" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
