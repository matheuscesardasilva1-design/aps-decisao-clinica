"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  Stethoscope,
  LayoutGrid,
  UserRound,
  HeartHandshake,
  Baby,
  Newspaper,
  Settings,
  LogOut,
  Menu,
  Upload,
} from "lucide-react";
import type {
  ClinicalSynthesis,
  FilterPillKey,
  SearchResultItem,
} from "@/types/clinical";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ManualPageViewer } from "@/components/ManualPageViewer";
import { TelessaudeViewer } from "@/components/TelessaudeViewer";
import { SynthesisPanel } from "@/components/SynthesisPanel";
import { cn } from "@/lib/utils";

interface ClinicalWorkspaceProps {
  userEmail?: string | null;
}

const NAV_AREAS: {
  key: FilterPillKey;
  label: string;
  subtitle: string;
  icon: React.ElementType;
  accent: string;
}[] = [
  {
    key: "todos",
    label: "Visão Geral",
    subtitle: "Acesso rápido às áreas da APS e últimas atualizações",
    icon: LayoutGrid,
    accent: "text-slate-700 dark:text-slate-200",
  },
  {
    key: "Adulto APS",
    label: "Adulto APS",
    subtitle: "Doenças crônicas, respiratórias, cardiovasculares e fluxogramas",
    icon: UserRound,
    accent: "text-sky-600 dark:text-sky-400",
  },
  {
    key: "Obstetrícia / Pré-Natal",
    label: "Saúde da Mulher",
    subtitle: "Pré-natal, ginecologia, rastreamentos e obstetrícia na APS",
    icon: HeartHandshake,
    accent: "text-rose-600 dark:text-rose-400",
  },
  {
    key: "Saúde da Criança / Puericultura",
    label: "Saúde da Criança",
    subtitle: "Puericultura, crescimento, vacinação e pediatria na APS",
    icon: Baby,
    accent: "text-amber-600 dark:text-amber-400",
  },
  {
    key: "TelessaúdeRS",
    label: "TelessaúdeRS",
    subtitle: "Perguntas da Semana oficiais com tabelas e condutas",
    icon: Newspaper,
    accent: "text-teal-600 dark:text-teal-400",
  },
  {
    key: "receita",
    label: "Receitas Modelo",
    subtitle: "Protocolos com prescrições prontas para copiar",
    icon: ClipboardList,
    accent: "text-emerald-600 dark:text-emerald-400",
  },
];

export function ClinicalWorkspace({ userEmail }: ClinicalWorkspaceProps) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);

  const [query, setQuery] = React.useState("");
  const [activeArea, setActiveArea] = React.useState<FilterPillKey>("todos");
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

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
            filter: activeArea,
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
  }, [query, activeArea]);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  const handleSelectArea = (key: FilterPillKey) => {
    setActiveArea(key);
    setSelectedItem(null);
    setMobileMenuOpen(false);
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

  // Separa Manuais vs TelessaúdeRS para NUNCA misturar tudo na Visão Geral
  const manualResults = React.useMemo(
    () => results.filter((r) => r.tipo_fonte === "manual_pagina"),
    [results]
  );
  const teleResults = React.useMemo(
    () => results.filter((r) => r.tipo_fonte === "telessaude"),
    [results]
  );

  const currentNav =
    NAV_AREAS.find((a) => a.key === activeArea) || NAV_AREAS[0];

  const sidebarContent = (
    <div className="flex h-full flex-col justify-between">
      <div>
        {/* Brand */}
        <div className="flex h-16 items-center gap-2.5 px-5 border-b border-black/[0.06] dark:border-white/[0.07]">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600 text-white shadow-sm">
            <Stethoscope className="h-4 w-4" />
          </div>
          <div className="leading-tight">
            <span className="block font-display text-sm font-bold tracking-tight text-slate-900 dark:text-white">
              APS Clínica
            </span>
            <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-400">
              Consultório Privado
            </span>
          </div>
        </div>

        {/* Navegação por Área Clínica */}
        <div className="px-3 py-4 space-y-6">
          <div>
            <p className="px-2.5 mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Principal
            </p>
            {NAV_AREAS.slice(0, 1).map((item) => {
              const Icon = item.icon;
              const active = activeArea === item.key && !selectedItem;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => handleSelectArea(item.key)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors",
                    active
                      ? "bg-teal-600/10 text-teal-800 dark:bg-teal-500/15 dark:text-teal-300 font-semibold"
                      : "text-slate-600 dark:text-slate-300 hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          <div>
            <p className="px-2.5 mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Áreas Clínicas
            </p>
            <div className="space-y-0.5">
              {NAV_AREAS.slice(1, 4).map((item) => {
                const Icon = item.icon;
                const active = activeArea === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => handleSelectArea(item.key)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors",
                      active
                        ? "bg-teal-600/10 text-teal-800 dark:bg-teal-500/15 dark:text-teal-300 font-semibold"
                        : "text-slate-600 dark:text-slate-300 hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"
                    )}
                  >
                    <Icon className={cn("h-4 w-4 shrink-0", !active && item.accent)} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="px-2.5 mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Apoio & Atualizações
            </p>
            <div className="space-y-0.5">
              {NAV_AREAS.slice(4).map((item) => {
                const Icon = item.icon;
                const active = activeArea === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => handleSelectArea(item.key)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors",
                      active
                        ? "bg-teal-600/10 text-teal-800 dark:bg-teal-500/15 dark:text-teal-300 font-semibold"
                        : "text-slate-600 dark:text-slate-300 hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"
                    )}
                  >
                    <Icon className={cn("h-4 w-4 shrink-0", !active && item.accent)} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Rodapé da Sidebar */}
      <div className="border-t border-black/[0.06] dark:border-white/[0.07] p-3 space-y-2">
        <Link
          href="/admin"
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-black/[0.04] dark:hover:bg-white/[0.05] transition-colors"
        >
          <Settings className="h-4 w-4 text-slate-400" />
          <span>Administração & PDFs</span>
        </Link>

        <div className="flex items-center justify-between gap-2 px-1 pt-1">
          <ThemeToggle />
          <button
            type="button"
            onClick={handleLogout}
            title={userEmail ? `Sair (${userEmail})` : "Sair"}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sair</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[var(--surface-canvas)]">
      {/* Sidebar Desktop Fixa */}
      <aside className="hidden lg:block w-64 shrink-0 border-r border-black/[0.06] dark:border-white/[0.07] bg-[var(--surface-card)] sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      {/* Drawer Mobile */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative z-10 w-64 bg-[var(--surface-card)] h-full shadow-2xl">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Área Principal */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra Superior de Busca Global */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-black/[0.06] dark:border-white/[0.07] bg-[var(--surface-canvas)]/90 px-4 sm:px-8 backdrop-blur-md">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Abrir menu"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--surface-card)] ring-1 ring-black/[0.08] dark:ring-white/[0.1] lg:hidden"
          >
            <Menu className="h-4 w-4" />
          </button>

          <div className="relative flex-1 max-w-2xl">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (selectedItem) setSelectedItem(null);
              }}
              placeholder="Buscar condição, fármaco, sintoma ou protocolo..."
              className="w-full rounded-xl bg-[var(--surface-card)] py-2 pl-10 pr-20 text-sm text-slate-900 dark:text-slate-50 placeholder:text-slate-400 ring-1 ring-black/[0.08] dark:ring-white/[0.1] focus:outline-none focus:ring-2 focus:ring-teal-600/70 transition-all"
            />
            <div className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    inputRef.current?.focus();
                  }}
                  className="rounded p-1 text-slate-400 hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              <span
                title="LGPD: Não digite nome, CPF ou CNS de pacientes."
                className="cursor-help p-1 text-slate-400 hover:text-teal-600"
              >
                <ShieldCheck className="h-4 w-4" />
              </span>
              <kbd className="hidden sm:inline-flex rounded bg-black/[0.04] dark:bg-white/[0.08] px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                ⌘K
              </kbd>
            </div>
          </div>

          {query.trim().length > 0 && results.length > 0 && !selectedItem && (
            <button
              type="button"
              onClick={handleSynthesize}
              disabled={synthesizing}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-teal-600 px-3.5 text-xs font-semibold text-white hover:bg-teal-700 transition-colors disabled:opacity-50"
            >
              {synthesizing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">Resumir (IA)</span>
            </button>
          )}
        </header>

        {/* Conteúdo Dinâmico */}
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-7 sm:px-8">
          {/* MODO LEITURA DE PROTOCOLO / PERGUNTA */}
          {selectedItem ? (
            <div className="animate-fade-in space-y-4">
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--surface-card)] px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 ring-1 ring-black/[0.08] dark:ring-white/[0.1] hover:ring-teal-500/50 hover:text-teal-700 dark:hover:text-teal-300 transition-all"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Voltar para {currentNav.label}
              </button>

              {selectedItem.tipo_fonte === "manual_pagina" ? (
                <ManualPageViewer item={selectedItem} />
              ) : (
                <TelessaudeViewer
                  item={selectedItem}
                  onMarkAsRead={handleMarkAsRead}
                />
              )}
            </div>
          ) : (
            <div className="animate-fade-in space-y-8">
              {/* Título da Área Atual */}
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                    {query.trim()
                      ? `Resultados para "${query.trim()}"`
                      : currentNav.label}
                  </h1>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {query.trim()
                      ? `${results.length} resultado(s) encontrado(s) em ${currentNav.label}`
                      : currentNav.subtitle}
                  </p>
                </div>
              </div>

              {/* Síntese IA Sob Demanda */}
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

              {/* VISÃO GERAL (SEM BUSCA): Módulos Separados + Seções Independentes */}
              {activeArea === "todos" && !query.trim() ? (
                <>
                  {/* 1. Módulos Clínicos da APS */}
                  <section className="space-y-3">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Áreas Clínicas
                    </h2>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      {NAV_AREAS.slice(1, 4).map((area) => {
                        const Icon = area.icon;
                        return (
                          <button
                            key={area.key}
                            type="button"
                            onClick={() => handleSelectArea(area.key)}
                            className="group flex flex-col justify-between rounded-2xl bg-[var(--surface-card)] p-5 text-left ring-1 ring-black/[0.07] dark:ring-white/[0.08] hover:ring-teal-500/50 transition-all"
                          >
                            <div>
                              <div className="mb-3 flex items-center justify-between">
                                <Icon className={cn("h-5 w-5", area.accent)} />
                                <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600 group-hover:translate-x-0.5 group-hover:text-teal-600 transition-all" />
                              </div>
                              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                                {area.label}
                              </h3>
                              <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                                {area.subtitle}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  {/* 2. Protocolos Clínicos (Separados do TelessaúdeRS) */}
                  <section className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Protocolos dos Manuais
                      </h2>
                      <button
                        type="button"
                        onClick={() => handleSelectArea("Adulto APS")}
                        className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline"
                      >
                        Ver todos →
                      </button>
                    </div>

                    {loading ? (
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        {[1, 2, 3, 4].map((n) => (
                          <div
                            key={n}
                            className="h-16 animate-pulse rounded-xl bg-[var(--surface-card)] ring-1 ring-black/[0.05] dark:ring-white/[0.06]"
                          />
                        ))}
                      </div>
                    ) : manualResults.length === 0 ? (
                      <div className="rounded-2xl bg-[var(--surface-card)] p-6 text-center text-xs text-slate-400 ring-1 ring-black/[0.06] dark:ring-white/[0.07]">
                        Nenhum protocolo indexado ainda.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        {manualResults.slice(0, 8).map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setSelectedItem(item)}
                            className="group flex items-center justify-between gap-3 rounded-xl bg-[var(--surface-card)] px-4 py-3.5 text-left ring-1 ring-black/[0.07] dark:ring-white/[0.08] hover:ring-teal-500/50 transition-all"
                          >
                            <div className="min-w-0">
                              <span className="block truncate text-sm font-medium text-slate-900 dark:text-slate-100 group-hover:text-teal-700 dark:group-hover:text-teal-300">
                                {item.titulo}
                              </span>
                              <span className="mt-0.5 block truncate text-[11px] text-slate-400">
                                {item.fonte_label}
                              </span>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              {item.possui_fluxograma && (
                                <GitBranch className="h-3.5 w-3.5 text-indigo-500" />
                              )}
                              {item.possui_receita_modelo && (
                                <ClipboardList className="h-3.5 w-3.5 text-amber-500" />
                              )}
                              <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600 group-hover:text-teal-600" />
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </section>

                  {/* 3. TelessaúdeRS — Seção Separada */}
                  <section className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                        TelessaúdeRS-UFRGS • Últimas Perguntas
                      </h2>
                      <button
                        type="button"
                        onClick={() => handleSelectArea("TelessaúdeRS")}
                        className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline"
                      >
                        Ver todas →
                      </button>
                    </div>

                    <div className="overflow-hidden rounded-2xl bg-[var(--surface-card)] ring-1 ring-black/[0.07] dark:ring-white/[0.08] divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                      {teleResults.slice(0, 5).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSelectedItem(item)}
                          className="group flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left hover:bg-slate-50/80 dark:hover:bg-white/[0.03] transition-colors"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              {item.is_new && (
                                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" />
                              )}
                              <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-100 group-hover:text-teal-700 dark:group-hover:text-teal-300">
                                {item.titulo}
                              </span>
                            </div>
                            <span className="mt-0.5 block text-[11px] text-slate-400">
                              {item.especialidade || "APS"} • {item.fonte_label}
                            </span>
                          </div>
                          <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600 group-hover:text-teal-600" />
                        </button>
                      ))}
                    </div>
                  </section>
                </>
              ) : (
                /* ÁREA ESPECÍFICA OU BUSCA ATIVA */
                <section>
                  {loading ? (
                    <div className="space-y-2.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <div
                          key={n}
                          className="h-16 animate-pulse rounded-xl bg-[var(--surface-card)] ring-1 ring-black/[0.05] dark:ring-white/[0.06]"
                        />
                      ))}
                    </div>
                  ) : error ? (
                    <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 p-4 text-xs text-rose-700 dark:text-rose-300">
                      {error}
                    </div>
                  ) : results.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-[var(--surface-card)] p-12 text-center ring-1 ring-black/[0.06] dark:ring-white/[0.07]">
                      <FileSearch className="h-7 w-7 text-slate-300 dark:text-slate-600" />
                      <div>
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                          Nenhum conteúdo ainda em {currentNav.label}
                        </p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {query.trim()
                            ? "Tente outro termo clínico ou busque em Visão Geral."
                            : "Você pode subir um manual PDF desta área na aba Administração."}
                        </p>
                      </div>
                      {!query.trim() && (
                        <Link
                          href="/admin"
                          className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-700 transition-colors"
                        >
                          <Upload className="h-3.5 w-3.5" />
                          Enviar PDF em Administração
                        </Link>
                      )}
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-2xl bg-[var(--surface-card)] ring-1 ring-black/[0.07] dark:ring-white/[0.08] divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                      {results.map((item) => (
                        <button
                          key={`${item.tipo_fonte}-${item.id}`}
                          type="button"
                          onClick={() => setSelectedItem(item)}
                          className="group flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left hover:bg-slate-50/80 dark:hover:bg-white/[0.03] transition-colors"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              {item.is_new && (
                                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" />
                              )}
                              <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-100 group-hover:text-teal-700 dark:group-hover:text-teal-300">
                                {item.titulo}
                              </span>
                            </div>
                            <span className="mt-0.5 block truncate text-[11px] text-slate-400">
                              {item.fonte_label}
                            </span>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {item.possui_fluxograma && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-black/[0.035] dark:bg-white/[0.06] px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                                <GitBranch className="h-3 w-3 text-indigo-500" />
                                <span className="hidden sm:inline">Fluxo</span>
                              </span>
                            )}
                            {item.possui_receita_modelo && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                                <ClipboardList className="h-3 w-3" />
                                <span className="hidden sm:inline">Receita</span>
                              </span>
                            )}
                            <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600 group-hover:text-teal-600" />
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
