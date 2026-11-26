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
} from "lucide-react";
import type { SearchResultItem } from "@/types/clinical";

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
  const [signedUrl, setSignedUrl] = React.useState<string | null>(null);
  const [loadingImg, setLoadingImg] = React.useState(true);
  const [imgError, setImgError] = React.useState<string | null>(null);
  const [zoom, setZoom] = React.useState(100);
  const [fullscreen, setFullscreen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    setZoom(100);
    setCopied(false);

    async function fetchSignedUrl() {
      if (!item.imagem_webp_path) {
        setSignedUrl(null);
        setLoadingImg(false);
        return;
      }
      setLoadingImg(true);
      setImgError(null);
      try {
        const res = await fetch(
          `/api/page-image?path=${encodeURIComponent(item.imagem_webp_path)}`
        );
        const data = (await res.json()) as { signedUrl?: string; error?: string };
        if (!res.ok || !data.signedUrl) {
          throw new Error(data.error || "Falha ao obter URL segura.");
        }
        if (active) {
          setSignedUrl(data.signedUrl);
        }
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
  }, [item.id, item.imagem_webp_path]);

  // Fechar tela cheia com ESC
  React.useEffect(() => {
    if (!fullscreen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullscreen]);

  const handleCopyPrescription = async () => {
    if (!item.texto_receita_verbatim) return;
    try {
      await navigator.clipboard.writeText(item.texto_receita_verbatim);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback para ambientes sem Clipboard API
      const textarea = document.createElement("textarea");
      textarea.value = item.texto_receita_verbatim;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const currentPage = item.numero_pagina ?? 1;
  const totalPages = item.manual_total_paginas ?? currentPage;
  const canGoPrev = Boolean(item.manual_id && currentPage > 1 && !navigating);
  const canGoNext = Boolean(item.manual_id && currentPage < totalPages && !navigating);

  const imageContainer = (
    <div className="relative flex-1 overflow-auto rounded-xl border border-[#E2E8F0] dark:border-[#334155] bg-slate-100/80 dark:bg-[#0B1120] p-3">
      {loadingImg ? (
        <div className="flex h-[520px] flex-col items-center justify-center gap-2 text-slate-500 dark:text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin text-[#0284C7]" />
          <span className="text-xs">Gerando Signed URL privada da página...</span>
        </div>
      ) : imgError ? (
        <div className="flex h-[320px] flex-col items-center justify-center gap-2 text-rose-600 dark:text-rose-400">
          <AlertCircle className="h-6 w-6" />
          <span className="text-xs font-medium">{imgError}</span>
        </div>
      ) : signedUrl ? (
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={signedUrl}
            alt={`${item.fonte_label} — ${item.titulo}`}
            style={{ width: `${zoom}%`, maxWidth: "none" }}
            className="rounded-lg bg-white shadow-md transition-all duration-150"
          />
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Cabeçalho Clínico da Página */}
      <div className="rounded-xl border border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-md bg-sky-100 dark:bg-sky-900/50 px-2 py-0.5 text-xs font-semibold text-[#0284C7] dark:text-sky-300">
                {item.fonte_label}
              </span>
              {item.possui_fluxograma && (
                <span className="inline-flex items-center gap-1 rounded-md bg-indigo-500/10 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">
                  <GitBranch className="h-3 w-3" />
                  Fluxograma Original (Fidelidade 100%)
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                <ShieldCheck className="h-3.5 w-3.5 text-[#0D9488]" />
                Imagem original sem reescrita por IA
              </span>
            </div>
            <h2 className="text-base font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
              {item.titulo}
            </h2>
            {item.subtitulo && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {item.subtitulo}
              </p>
            )}
          </div>

          {/* Controles de Navegação de Página + Zoom */}
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="inline-flex items-center rounded-lg border border-[#E2E8F0] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#0B1120] p-0.5">
              <button
                type="button"
                disabled={!canGoPrev}
                onClick={() =>
                  item.manual_id && onNavigatePage(item.manual_id, currentPage - 1)
                }
                title="Página Anterior"
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800 disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span className="hidden xl:inline">Anterior</span>
              </button>
              <span className="px-2 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                {navigating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  `${currentPage} / ${totalPages}`
                )}
              </span>
              <button
                type="button"
                disabled={!canGoNext}
                onClick={() =>
                  item.manual_id && onNavigatePage(item.manual_id, currentPage + 1)
                }
                title="Próxima Página"
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800 disabled:opacity-40"
              >
                <span className="hidden xl:inline">Próxima</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="inline-flex items-center rounded-lg border border-[#E2E8F0] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#0B1120] p-0.5">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(60, z - 20))}
                title="Diminuir Zoom"
                className="rounded-md p-1.5 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <span className="min-w-[42px] text-center text-[11px] font-medium text-slate-600 dark:text-slate-300">
                {zoom}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(240, z + 20))}
                title="Aumentar Zoom"
                className="rounded-md p-1.5 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setZoom(100)}
                title="Resetar Zoom"
                className="rounded-md p-1.5 text-slate-500 hover:bg-white dark:hover:bg-slate-800"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setFullscreen(true)}
                title="Tela Cheia"
                className="rounded-md p-1.5 text-[#0284C7] dark:text-sky-400 hover:bg-white dark:hover:bg-slate-800"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bloco Destacado de Receita Modelo Verbatim (1-Clique) */}
      {item.texto_receita_verbatim && (
        <div className="rounded-xl border border-amber-300/80 dark:border-amber-700/70 bg-amber-50/70 dark:bg-amber-950/30 p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-900 dark:text-amber-200">
              <ClipboardList className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              Exemplo de Receita Extraído Verbatim (Pronto para Cópia)
            </div>
            <button
              type="button"
              onClick={handleCopyPrescription}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-700 transition-colors"
            >
              {copied ? (
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
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-amber-200/80 dark:border-amber-800/60 bg-white/90 dark:bg-[#0B1120]/80 p-3 font-mono text-xs leading-relaxed text-slate-800 dark:text-slate-100">
            {item.texto_receita_verbatim}
          </pre>
        </div>
      )}

      {/* Visualizador WebP Original */}
      {imageContainer}

      {/* Modal de Tela Cheia */}
      {fullscreen && signedUrl && (
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/95 p-4 backdrop-blur-sm">
          <div className="mb-3 flex items-center justify-between gap-4 rounded-xl bg-slate-900/90 px-4 py-2.5 text-slate-100 border border-slate-800">
            <div className="truncate text-sm font-medium">
              {item.fonte_label} — {item.titulo}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!canGoPrev}
                onClick={() =>
                  item.manual_id && onNavigatePage(item.manual_id, currentPage - 1)
                }
                className="rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs hover:bg-slate-700 disabled:opacity-40"
              >
                ← Pág. {currentPage - 1}
              </button>
              <button
                type="button"
                disabled={!canGoNext}
                onClick={() =>
                  item.manual_id && onNavigatePage(item.manual_id, currentPage + 1)
                }
                className="rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs hover:bg-slate-700 disabled:opacity-40"
              >
                Pág. {currentPage + 1} →
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
