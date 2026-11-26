"use client";

import * as React from "react";
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Minimize2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  Loader2,
  GitBranch,
  ClipboardList,
  AlertCircle,
  ShieldCheck,
  BookOpen,
  FileText,
} from "lucide-react";
import type { SearchResultItem } from "@/types/clinical";
import { cn } from "@/lib/utils";

interface ChapterPageFull {
  id: string;
  numero_pagina: number;
  imagem_webp_path: string;
  capitulo_tema: string;
  subtitulo_pagina: string;
  palavras_chave_clinicas: string[];
  possui_fluxograma: boolean;
  possui_receita_modelo: boolean;
  texto_receita_verbatim: string | null;
  texto_indexacao: string;
}

interface ManualPageViewerProps {
  item: SearchResultItem;
  onNavigatePage: (manualId: string, nextPage: number) => Promise<void>;
  navigating: boolean;
}

export function ManualPageViewer({
  item,
  onNavigatePage,
  navigating,
}: ManualPageViewerProps) {
  const [chapterPages, setChapterPages] = React.useState<ChapterPageFull[]>([]);
  const [loadingChapter, setLoadingChapter] = React.useState(true);
  const [activePageNum, setActivePageNum] = React.useState<number>(
    item.numero_pagina ?? 1
  );

  const [signedUrl, setSignedUrl] = React.useState<string | null>(null);
  const [loadingImg, setLoadingImg] = React.useState(true);
  const [imgError, setImgError] = React.useState<string | null>(null);
  const [zoom, setZoom] = React.useState(100);
  const [fullscreen, setFullscreen] = React.useState(false);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  // 1. Carrega TODAS as páginas do tema/capítulo agrupado
  React.useEffect(() => {
    let active = true;
    setLoadingChapter(true);
    setActivePageNum(item.numero_pagina ?? 1);

    async function fetchChapter() {
      if (!item.manual_id) {
        setChapterPages([]);
        setLoadingChapter(false);
        return;
      }
      try {
        const params = new URLSearchParams({
          manualId: item.manual_id,
          capitulo: item.titulo || "",
          page: String(item.numero_pagina ?? 1),
        });
        const res = await fetch(`/api/manual-chapter?${params.toString()}`);
        const data = (await res.json()) as { pages?: ChapterPageFull[] };
        if (active) {
          const pages = data.pages || [];
          setChapterPages(pages);
          // Prioriza exibir automaticamente a primeira página com Fluxograma do capítulo!
          const firstFlowchart = pages.find((p) => p.possui_fluxograma);
          if (firstFlowchart) {
            setActivePageNum(firstFlowchart.numero_pagina);
          } else if (pages.length > 0) {
            setActivePageNum(item.numero_pagina ?? pages[0].numero_pagina);
          }
        }
      } catch {
        if (active) setChapterPages([]);
      } finally {
        if (active) setLoadingChapter(false);
      }
    }

    fetchChapter();
    return () => {
      active = false;
    };
  }, [item.id, item.manual_id, item.titulo, item.numero_pagina]);

  // Página atualmente selecionada no visualizador de fluxograma/imagem abaixo
  const activePage = React.useMemo(() => {
    const found = chapterPages.find((p) => p.numero_pagina === activePageNum);
    if (found) return found;
    return {
      id: item.id,
      numero_pagina: item.numero_pagina ?? 1,
      imagem_webp_path: item.imagem_webp_path || "",
      capitulo_tema: item.titulo,
      subtitulo_pagina: item.subtitulo,
      palavras_chave_clinicas: item.palavras_chave || [],
      possui_fluxograma: item.possui_fluxograma,
      possui_receita_modelo: item.possui_receita_modelo,
      texto_receita_verbatim: item.texto_receita_verbatim,
      texto_indexacao: item.texto_indexacao || "",
    };
  }, [chapterPages, activePageNum, item]);

  // 2. Carrega Signed URL privada apenas para a imagem da página ativa no visualizador
  React.useEffect(() => {
    let active = true;
    setZoom(100);

    async function fetchSignedUrl() {
      if (!activePage.imagem_webp_path) {
        setSignedUrl(null);
        setLoadingImg(false);
        return;
      }
      setLoadingImg(true);
      setImgError(null);
      try {
        const res = await fetch(
          `/api/page-image?path=${encodeURIComponent(activePage.imagem_webp_path)}`
        );
        const data = (await res.json()) as { signedUrl?: string; error?: string };
        if (!res.ok || !data.signedUrl) {
          throw new Error(data.error || "Falha ao obter URL segura.");
        }
        if (active) setSignedUrl(data.signedUrl);
      } catch (err) {
        if (active) {
          setImgError(
            err instanceof Error ? err.message : "Erro ao carregar página original."
          );
        }
      } finally {
        if (active) setLoadingImg(false);
      }
    }

    fetchSignedUrl();
    return () => {
      active = false;
    };
  }, [activePage.imagem_webp_path]);

  // Fechar tela cheia com ESC
  React.useEffect(() => {
    if (!fullscreen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullscreen]);

  const handleCopyPrescription = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  // Consolida receitas, tags e páginas de fluxograma do capítulo inteiro
  const allPrescriptions = React.useMemo(() => {
    const list = chapterPages.filter((p) => p.texto_receita_verbatim);
    if (list.length > 0) return list;
    if (item.texto_receita_verbatim) return [activePage];
    return [];
  }, [chapterPages, item.texto_receita_verbatim, activePage]);

  const allKeywords = React.useMemo(() => {
    const set = new Set<string>();
    (chapterPages.length > 0 ? chapterPages : [activePage]).forEach((p) =>
      (p.palavras_chave_clinicas || []).forEach((k) => set.add(k))
    );
    return Array.from(set).slice(0, 16);
  }, [chapterPages, activePage]);

  const flowchartPages = React.useMemo(
    () => chapterPages.filter((p) => p.possui_fluxograma),
    [chapterPages]
  );

  const pageRangeLabel = React.useMemo(() => {
    if (chapterPages.length <= 1) return `Pág. ${activePage.numero_pagina}`;
    const first = chapterPages[0].numero_pagina;
    const last = chapterPages[chapterPages.length - 1].numero_pagina;
    return `Págs. ${first}–${last} (${chapterPages.length} páginas agrupadas)`;
  }, [chapterPages, activePage.numero_pagina]);

  const totalPages = item.manual_total_paginas ?? activePage.numero_pagina;
  const canGoPrev = Boolean(item.manual_id && activePage.numero_pagina > 1 && !navigating);
  const canGoNext = Boolean(item.manual_id && activePage.numero_pagina < totalPages && !navigating);

  const handleStepPage = (delta: number) => {
    const target = activePage.numero_pagina + delta;
    if (chapterPages.some((p) => p.numero_pagina === target)) {
      setActivePageNum(target);
    } else if (item.manual_id) {
      onNavigatePage(item.manual_id, target);
    }
  };

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto pr-1 pb-8">
      {/* 1. Cabeçalho Consolidado do Tema */}
      <div className="rounded-xl border border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B] p-5 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-md bg-sky-100 dark:bg-sky-900/50 px-2.5 py-0.5 text-xs font-semibold text-[#0284C7] dark:text-sky-300">
            {item.manual_titulo} {item.manual_versao} • {pageRangeLabel}
          </span>
          {flowchartPages.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-indigo-500/10 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">
              <GitBranch className="h-3 w-3" />
              {flowchartPages.length} Fluxograma(s) Original(is)
            </span>
          )}
          {allPrescriptions.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:text-amber-300">
              <ClipboardList className="h-3 w-3" />
              {allPrescriptions.length} Receita(s) Modelo
            </span>
          )}
        </div>

        <h2 className="text-lg font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
          {item.titulo}
        </h2>

        {allKeywords.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {allKeywords.map((tag, idx) => (
              <span
                key={idx}
                className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 2. Informações Principais Consolidadas de TODO o Capítulo (Leitura Contínua) */}
      <section className="rounded-xl border border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B] p-5 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] dark:border-[#334155] pb-2.5">
          <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#0284C7] dark:text-sky-400">
            <BookOpen className="h-4 w-4" />
            Informações Principais do Tema (Resumo Consolidado)
          </h3>
          {loadingChapter && (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Agrupando páginas do capítulo...
            </span>
          )}
        </div>

        <div className="space-y-3.5">
          {(chapterPages.length > 0 ? chapterPages : [activePage]).map((p) => (
            <div
              key={p.numero_pagina}
              className="rounded-lg border border-[#E2E8F0]/80 dark:border-[#334155]/80 bg-[#F8FAFC]/80 dark:bg-[#0B1120]/50 p-3.5"
            >
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                    {p.subtitulo_pagina || `Seção — Página ${p.numero_pagina}`}
                  </span>
                  {p.possui_fluxograma && (
                    <span className="inline-flex items-center gap-1 rounded bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 dark:text-indigo-300">
                      <GitBranch className="h-2.5 w-2.5" />
                      Fluxograma
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setActivePageNum(p.numero_pagina)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors",
                    activePage.numero_pagina === p.numero_pagina
                      ? "bg-[#0284C7] text-white"
                      : "bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] text-slate-600 dark:text-slate-300 hover:border-[#0284C7]"
                  )}
                >
                  <FileText className="h-3 w-3" />
                  Ver Pág. {p.numero_pagina} abaixo
                </button>
              </div>

              {p.texto_indexacao && (
                <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                  {p.texto_indexacao}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* 3. Todas as Receitas Modelo do Capítulo (1-Clique Copiar) */}
      {allPrescriptions.map((p) => (
        <div
          key={`rx-${p.numero_pagina}`}
          className="rounded-xl border border-amber-300/80 dark:border-amber-700/70 bg-amber-50/70 dark:bg-amber-950/30 p-4 shadow-sm"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-900 dark:text-amber-200">
              <ClipboardList className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              Exemplo de Receita Verbatim (Pág. {p.numero_pagina})
            </div>
            <button
              type="button"
              onClick={() =>
                p.texto_receita_verbatim &&
                handleCopyPrescription(String(p.numero_pagina), p.texto_receita_verbatim)
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-700 transition-colors"
            >
              {copiedId === String(p.numero_pagina) ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Copiado!
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copiar Receita
                </>
              )}
            </button>
          </div>
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border border-amber-200/80 dark:border-amber-800/60 bg-white/90 dark:bg-[#0B1120]/80 p-3 font-mono text-xs leading-relaxed text-slate-800 dark:text-slate-100">
            {p.texto_receita_verbatim}
          </pre>
        </div>
      ))}

      {/* 4. Fluxogramas & Páginas Originais do Capítulo (Visualizador Fiel 150 DPI) */}
      <section className="rounded-xl border border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B] overflow-hidden shadow-sm">
        <div className="border-b border-[#E2E8F0] dark:border-[#334155] px-4 py-3 bg-slate-50/80 dark:bg-slate-800/40 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
              <ShieldCheck className="h-4 w-4 text-[#0D9488]" />
              Fluxogramas & Páginas Originais (Pág. {activePage.numero_pagina})
            </span>

            <div className="flex flex-wrap items-center gap-1.5">
              {/* Anterior / Próxima */}
              <div className="inline-flex items-center rounded-lg border border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#0B1120] p-0.5">
                <button
                  type="button"
                  disabled={!canGoPrev}
                  onClick={() => handleStepPage(-1)}
                  title="Página Anterior"
                  className="rounded-md p-1 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="px-2 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  Pág. {activePage.numero_pagina}
                </span>
                <button
                  type="button"
                  disabled={!canGoNext}
                  onClick={() => handleStepPage(1)}
                  title="Próxima Página"
                  className="rounded-md p-1 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Zoom + Tela Cheia */}
              <div className="inline-flex items-center rounded-lg border border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#0B1120] p-0.5">
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(60, z - 20))}
                  title="Diminuir Zoom"
                  className="rounded-md p-1 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </button>
                <span className="min-w-[38px] text-center text-[11px] font-medium text-slate-600 dark:text-slate-300">
                  {zoom}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(240, z + 20))}
                  title="Aumentar Zoom"
                  className="rounded-md p-1 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoom(100)}
                  title="Resetar Zoom"
                  className="rounded-md p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setFullscreen(true)}
                  title="Tela Cheia"
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-[#0284C7] dark:text-sky-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                  Tela Cheia
                </button>
              </div>
            </div>
          </div>

          {/* Abas rápidas das páginas do capítulo (Fluxogramas destacados) */}
          {chapterPages.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {chapterPages.map((p) => {
                const isSelected = p.numero_pagina === activePage.numero_pagina;
                return (
                  <button
                    key={p.numero_pagina}
                    type="button"
                    onClick={() => setActivePageNum(p.numero_pagina)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors",
                      isSelected
                        ? "bg-[#0284C7] text-white shadow-sm"
                        : "border border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#0B1120] text-slate-700 dark:text-slate-200 hover:border-[#0284C7]"
                    )}
                  >
                    <span>Pág. {p.numero_pagina}</span>
                    {p.possui_fluxograma && (
                      <span
                        className={cn(
                          "inline-flex items-center gap-0.5 text-[10px] font-semibold",
                          isSelected ? "text-sky-100" : "text-indigo-600 dark:text-indigo-400"
                        )}
                      >
                        <GitBranch className="h-3 w-3" />
                        Fluxograma
                      </span>
                    )}
                    {p.possui_receita_modelo && (
                      <ClipboardList
                        className={cn(
                          "h-3 w-3",
                          isSelected ? "text-amber-200" : "text-amber-500"
                        )}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="overflow-auto bg-slate-100/80 dark:bg-[#0B1120] p-3">
          {loadingImg ? (
            <div className="flex h-[460px] flex-col items-center justify-center gap-2 text-slate-500 dark:text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin text-[#0284C7]" />
              <span className="text-xs">Gerando Signed URL privada da página...</span>
            </div>
          ) : imgError ? (
            <div className="flex h-[280px] flex-col items-center justify-center gap-2 text-rose-600 dark:text-rose-400">
              <AlertCircle className="h-6 w-6" />
              <span className="text-xs font-medium">{imgError}</span>
            </div>
          ) : signedUrl ? (
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={signedUrl}
                alt={`${item.titulo} — Página ${activePage.numero_pagina}`}
                style={{ width: `${zoom}%`, maxWidth: "none" }}
                className="rounded-lg bg-white shadow-md transition-all duration-150"
              />
            </div>
          ) : null}
        </div>
      </section>

      {/* Modal de Tela Cheia */}
      {fullscreen && signedUrl && (
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/95 p-4 backdrop-blur-sm">
          <div className="mb-3 flex items-center justify-between gap-4 rounded-xl bg-slate-900/90 px-4 py-2.5 text-slate-100 border border-slate-800">
            <div className="truncate text-sm font-medium">
              {item.titulo} — Página {activePage.numero_pagina}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!canGoPrev}
                onClick={() => handleStepPage(-1)}
                className="rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs hover:bg-slate-700 disabled:opacity-40"
              >
                ← Pág. {activePage.numero_pagina - 1}
              </button>
              <button
                type="button"
                disabled={!canGoNext}
                onClick={() => handleStepPage(1)}
                className="rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs hover:bg-slate-700 disabled:opacity-40"
              >
                Pág. {activePage.numero_pagina + 1} →
              </button>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(60, z - 20))}
                className="rounded-lg bg-slate-800 p-1.5 hover:bg-slate-700"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <span className="text-xs font-semibold">{zoom}%</span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(260, z + 20))}
                className="rounded-lg bg-slate-800 p-1.5 hover:bg-slate-700"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setFullscreen(false)}
                className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500"
              >
                <Minimize2 className="h-3.5 w-3.5" />
                Fechar (ESC)
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={signedUrl}
              alt={item.titulo}
              style={{ width: `${zoom}%`, maxWidth: "none" }}
              className="h-fit rounded-lg bg-white shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}
