"use client";

import * as React from "react";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Copy,
  Check,
  Loader2,
  GitBranch,
  ClipboardList,
  Sparkles,
  Pill,
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
}

export function ManualPageViewer({ item }: ManualPageViewerProps) {
  const [chapterPages, setChapterPages] = React.useState<ChapterPageFull[]>([]);
  const [loadingChapter, setLoadingChapter] = React.useState(true);
  const [onlyFlowcharts, setOnlyFlowcharts] = React.useState(false);

  const [signedUrls, setSignedUrls] = React.useState<Record<number, string>>({});
  const [fullscreenImg, setFullscreenImg] = React.useState<{
    url: string;
    title: string;
  } | null>(null);
  const [fullscreenZoom, setFullscreenZoom] = React.useState(100);
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);

  // Gerador de Prescrição Pronta sob demanda
  const [generatingRx, setGeneratingRx] = React.useState(false);
  const [generatedRx, setGeneratedRx] = React.useState<string>("");
  const [rxError, setRxError] = React.useState<string | null>(null);

  // Carrega TODAS as páginas do tema agrupado
  React.useEffect(() => {
    let active = true;
    setLoadingChapter(true);
    setOnlyFlowcharts(false);
    setSignedUrls({});
    setGeneratedRx("");
    setRxError(null);

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
          setChapterPages(data.pages || []);
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

  const pagesToUse = React.useMemo<ChapterPageFull[]>(() => {
    if (chapterPages.length > 0) return chapterPages;
    return [
      {
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
      },
    ];
  }, [chapterPages, item]);

  const flowchartPages = React.useMemo(
    () => pagesToUse.filter((p) => p.possui_fluxograma),
    [pagesToUse]
  );

  const visiblePages = onlyFlowcharts && flowchartPages.length > 0 ? flowchartPages : pagesToUse;

  const verbatimPrescriptions = React.useMemo(
    () => pagesToUse.filter((p) => p.texto_receita_verbatim),
    [pagesToUse]
  );

  // Carrega Signed URLs em lote imediatamente para todas as páginas do tema (rolagem contínua)
  React.useEffect(() => {
    const missing = visiblePages.filter(
      (p) => p.imagem_webp_path && !signedUrls[p.numero_pagina]
    );
    if (missing.length === 0) return;

    let active = true;

    Promise.all(
      missing.map(async (p) => {
        try {
          const res = await fetch(
            `/api/page-image?path=${encodeURIComponent(p.imagem_webp_path)}`
          );
          const data = (await res.json()) as { signedUrl?: string };
          return [p.numero_pagina, data.signedUrl || ""] as const;
        } catch {
          return [p.numero_pagina, ""] as const;
        }
      })
    ).then((entries) => {
      if (!active) return;
      setSignedUrls((prev) => {
        const next = { ...prev };
        for (const [num, url] of entries) {
          if (url) next[num] = url;
        }
        return next;
      });
    });

    return () => {
      active = false;
    };
  }, [visiblePages, signedUrls]);

  // ESC fecha tela cheia
  React.useEffect(() => {
    if (!fullscreenImg) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreenImg(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreenImg]);

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleGeneratePrescription = async () => {
    setGeneratingRx(true);
    setRxError(null);
    try {
      const contexto = pagesToUse
        .map(
          (p) =>
            `${p.subtitulo_pagina}\n${p.texto_indexacao}\n${p.texto_receita_verbatim || ""}`
        )
        .join("\n\n");

      // Prioriza páginas de receita/tratamento/tabela para leitura visual exata de doses
      const prioritizedPages = [...pagesToUse].sort((a, b) => {
        const score = (p: ChapterPageFull) => {
          const s = `${p.subtitulo_pagina} ${p.texto_indexacao}`.toLowerCase();
          let pts = 0;
          if (p.possui_receita_modelo) pts += 10;
          if (/tratamento|farmacol|dose|prescri|medicament|receita|tabela/.test(s)) pts += 5;
          return pts;
        };
        return score(b) - score(a);
      });

      const res = await fetch("/api/prescription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: item.titulo,
          conteudo: contexto,
          imagePaths: prioritizedPages.slice(0, 4).map((p) => p.imagem_webp_path),
        }),
      });
      const data = (await res.json()) as { prescription?: string; error?: string };
      if (!res.ok || !data.prescription) {
        throw new Error(data.error || "Falha ao montar prescrição.");
      }
      setGeneratedRx(data.prescription);
    } catch (err) {
      setRxError(err instanceof Error ? err.message : "Erro ao gerar prescrição.");
    } finally {
      setGeneratingRx(false);
    }
  };

  const scrollToSection = (pageNum: number) => {
    const el = document.getElementById(`manual-sec-${pageNum}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const pageRange =
    pagesToUse.length > 1
      ? `Págs. ${pagesToUse[0].numero_pagina}–${pagesToUse[pagesToUse.length - 1].numero_pagina}`
      : `Pág. ${pagesToUse[0]?.numero_pagina ?? 1}`;

  return (
    <div className="h-full space-y-4 overflow-y-auto pr-1 pb-10">
      {/* Cabeçalho Limpo + Atalhos de Seção (Rolagem Contínua, Sem Folhear) */}
      <div className="rounded-2xl bg-[var(--surface-card)] ring-1 ring-black/[0.07] dark:ring-white/[0.08] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {item.manual_titulo} {item.manual_versao} • {pageRange}
            </p>
            <h2 className="mt-1 font-display text-xl sm:text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
              {item.titulo}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {flowchartPages.length > 0 && (
              <button
                type="button"
                onClick={() => setOnlyFlowcharts((v) => !v)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
                  onlyFlowcharts
                    ? "border-indigo-500 bg-indigo-600 text-white"
                    : "border-[#E2E8F0] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#0B1120] text-slate-700 dark:text-slate-200 hover:border-indigo-400"
                )}
              >
                <GitBranch className="h-3.5 w-3.5" />
                {onlyFlowcharts
                  ? `Mostrando só Fluxogramas (${flowchartPages.length})`
                  : `Só Fluxogramas (${flowchartPages.length})`}
              </button>
            )}

            <button
              type="button"
              onClick={handleGeneratePrescription}
              disabled={generatingRx || loadingChapter}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0D9488] px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 transition-colors disabled:opacity-50"
            >
              {generatingRx ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Pill className="h-3.5 w-3.5" />
              )}
              Montar Prescrição Pronta
            </button>
          </div>
        </div>

        {/* Índice Rápido do Tema (rolagem suave até a seção/fluxograma) */}
        {visiblePages.length > 1 && (
          <div className="mt-3.5 flex flex-wrap gap-1.5 border-t border-[#E2E8F0] dark:border-[#334155] pt-3">
            {visiblePages.map((p) => (
              <button
                key={p.numero_pagina}
                type="button"
                onClick={() => scrollToSection(p.numero_pagina)}
                className="inline-flex items-center gap-1 rounded-md border border-[#E2E8F0] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#0B1120] px-2.5 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:border-[#0284C7] hover:text-[#0284C7] transition-colors"
              >
                {p.possui_fluxograma ? (
                  <GitBranch className="h-3 w-3 text-indigo-500" />
                ) : p.possui_receita_modelo ? (
                  <ClipboardList className="h-3 w-3 text-amber-500" />
                ) : (
                  <FileText className="h-3 w-3 text-slate-400" />
                )}
                <span className="max-w-[200px] truncate">
                  {p.subtitulo_pagina || `Pág. ${p.numero_pagina}`}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Prescrição Pronta Gerada (Editável + Copiar 1 Clique) */}
      {rxError && (
        <div className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-4 py-3 text-xs text-rose-700 dark:text-rose-300">
          {rxError}
        </div>
      )}
      {generatedRx && (
        <div className="rounded-xl border border-teal-300 dark:border-teal-700 bg-teal-50/70 dark:bg-teal-950/30 p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-teal-900 dark:text-teal-200">
              <Sparkles className="h-4 w-4 text-[#0D9488]" />
              Prescrição Pronta (edite se necessário e copie para o prontuário)
            </span>
            <button
              type="button"
              onClick={() => copyText("gen-rx", generatedRx)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0D9488] px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700"
            >
              {copiedKey === "gen-rx" ? (
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
          <textarea
            value={generatedRx}
            onChange={(e) => setGeneratedRx(e.target.value)}
            rows={8}
            className="w-full rounded-lg border border-teal-200 dark:border-teal-800 bg-white dark:bg-[#0B1120] p-3 font-mono text-xs leading-relaxed text-slate-800 dark:text-slate-100 focus:border-[#0D9488] focus:outline-none"
          />
        </div>
      )}

      {/* Receitas Modelo Verbatim Extraídas do Manual (1-Clique Copiar) */}
      {verbatimPrescriptions.map((p) => (
        <div
          key={`rx-${p.numero_pagina}`}
          className="rounded-xl border border-amber-300/80 dark:border-amber-700/70 bg-amber-50/70 dark:bg-amber-950/30 p-4"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-xs font-semibold text-amber-900 dark:text-amber-200">
              <ClipboardList className="h-4 w-4 text-amber-600" />
              Exemplo de Receita do Manual (Pág. {p.numero_pagina})
            </span>
            <button
              type="button"
              onClick={() =>
                p.texto_receita_verbatim &&
                copyText(`rx-${p.numero_pagina}`, p.texto_receita_verbatim)
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
            >
              {copiedKey === `rx-${p.numero_pagina}` ? (
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
          <pre className="whitespace-pre-wrap select-text rounded-lg border border-amber-200/80 dark:border-amber-800/60 bg-white dark:bg-[#0B1120] p-3 font-mono text-xs leading-relaxed text-slate-800 dark:text-slate-100">
            {p.texto_receita_verbatim}
          </pre>
        </div>
      ))}

      {/* Protocolo Visual Original Empilhado (Tabelas + Fluxogramas em 150 DPI — Zero Alucinação) */}
      {loadingChapter ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B] py-16 text-xs text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin text-[#0284C7]" />
          Carregando páginas do tema...
        </div>
      ) : (
        <div className="space-y-4">
          {visiblePages.map((p) => {
            const url = signedUrls[p.numero_pagina];
            return (
              <section
                id={`manual-sec-${p.numero_pagina}`}
                key={`page-${p.numero_pagina}`}
                className="rounded-xl border border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B] overflow-hidden"
              >
                <div className="flex items-center justify-between gap-2 border-b border-[#E2E8F0] dark:border-[#334155] px-4 py-2.5 bg-slate-50/70 dark:bg-slate-800/40">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="truncate text-xs font-semibold text-slate-700 dark:text-slate-200">
                      {p.subtitulo_pagina || p.capitulo_tema}
                    </span>
                    <span className="shrink-0 text-[11px] text-slate-400">
                      Pág. {p.numero_pagina}
                    </span>
                  </div>

                  {url && (
                    <button
                      type="button"
                      onClick={() => {
                        setFullscreenZoom(100);
                        setFullscreenImg({
                          url,
                          title: `${p.subtitulo_pagina || item.titulo} (Pág. ${p.numero_pagina})`,
                        });
                      }}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-[#0284C7] dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-slate-700"
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                      Ampliar
                    </button>
                  )}
                </div>

                <div className="bg-slate-100/80 dark:bg-[#0B1120] p-3 flex justify-center">
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={url}
                      alt={`${p.subtitulo_pagina || item.titulo} — Pág. ${p.numero_pagina}`}
                      onClick={() => {
                        setFullscreenZoom(100);
                        setFullscreenImg({
                          url,
                          title: `${p.subtitulo_pagina || item.titulo} (Pág. ${p.numero_pagina})`,
                        });
                      }}
                      className="max-w-full cursor-zoom-in rounded-lg bg-white shadow-sm"
                    />
                  ) : (
                    <div className="flex h-48 items-center gap-2 text-xs text-slate-400">
                      <Loader2 className="h-4 w-4 animate-spin text-[#0284C7]" />
                      Carregando página {p.numero_pagina}...
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Modal Tela Cheia */}
      {fullscreenImg && (
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/95 p-4 backdrop-blur-sm">
          <div className="mb-3 flex items-center justify-between gap-4 rounded-xl bg-slate-900 px-4 py-2.5 text-slate-100 border border-slate-800">
            <span className="truncate text-sm font-medium">{fullscreenImg.title}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFullscreenZoom((z) => Math.max(60, z - 20))}
                className="rounded-lg bg-slate-800 p-1.5 hover:bg-slate-700"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <span className="text-xs font-semibold">{fullscreenZoom}%</span>
              <button
                type="button"
                onClick={() => setFullscreenZoom((z) => Math.min(260, z + 20))}
                className="rounded-lg bg-slate-800 p-1.5 hover:bg-slate-700"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setFullscreenImg(null)}
                className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500"
              >
                <Minimize2 className="h-3.5 w-3.5" />
                Fechar
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={fullscreenImg.url}
              alt={fullscreenImg.title}
              style={{ width: `${fullscreenZoom}%`, maxWidth: "none" }}
              className="h-fit rounded-lg bg-white shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}
