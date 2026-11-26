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
  BookOpen,
  FileText,
  Sparkles,
  Pill,
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

type ViewerTab = "conduta" | "fluxogramas" | "paginas";

interface ManualPageViewerProps {
  item: SearchResultItem;
}

export function ManualPageViewer({ item }: ManualPageViewerProps) {
  const [chapterPages, setChapterPages] = React.useState<ChapterPageFull[]>([]);
  const [loadingChapter, setLoadingChapter] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState<ViewerTab>("conduta");

  const [signedUrls, setSignedUrls] = React.useState<Record<number, string>>({});
  const [loadingImgs, setLoadingImgs] = React.useState(false);

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
    setActiveTab("conduta");
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

  const verbatimPrescriptions = React.useMemo(
    () => pagesToUse.filter((p) => p.texto_receita_verbatim),
    [pagesToUse]
  );

  // Carrega Signed URLs em lote quando o médico abre a aba de Fluxogramas ou Páginas PDF
  React.useEffect(() => {
    if (activeTab === "conduta") return;
    const targets = activeTab === "fluxogramas" ? flowchartPages : pagesToUse;
    const missing = targets.filter(
      (p) => p.imagem_webp_path && !signedUrls[p.numero_pagina]
    );
    if (missing.length === 0) return;

    let active = true;
    setLoadingImgs(true);

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
      setLoadingImgs(false);
    });

    return () => {
      active = false;
    };
  }, [activeTab, flowchartPages, pagesToUse, signedUrls]);

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

  const fullProtocolText = React.useMemo(() => {
    return pagesToUse
      .map(
        (p) =>
          `${p.subtitulo_pagina || `Seção (Pág. ${p.numero_pagina})`}\n${p.texto_indexacao || ""}`
      )
      .join("\n\n");
  }, [pagesToUse]);

  const handleGeneratePrescription = async () => {
    setGeneratingRx(true);
    setRxError(null);
    try {
      const res = await fetch("/api/prescription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: item.titulo,
          conteudo: fullProtocolText,
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

  const pageRange =
    pagesToUse.length > 1
      ? `Págs. ${pagesToUse[0].numero_pagina}–${pagesToUse[pagesToUse.length - 1].numero_pagina}`
      : `Pág. ${pagesToUse[0]?.numero_pagina ?? 1}`;

  return (
    <div className="h-full space-y-4 overflow-y-auto pr-1 pb-10">
      {/* Cabeçalho Limpo + Abas (Sem Folhear Páginas) */}
      <div className="rounded-xl border border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {item.manual_titulo} {item.manual_versao} • {pageRange}
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-[#0F172A] dark:text-[#F1F5F9]">
              {item.titulo}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
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

            <button
              type="button"
              onClick={() => copyText("all", `${item.titulo}\n\n${fullProtocolText}`)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#0B1120] px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-[#0284C7] transition-colors"
            >
              {copiedKey === "all" ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                  Copiado!
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copiar Tudo
                </>
              )}
            </button>
          </div>
        </div>

        {/* Abas de Navegação do Tema */}
        <div className="mt-4 flex items-center gap-1 border-b border-[#E2E8F0] dark:border-[#334155]">
          <button
            type="button"
            onClick={() => setActiveTab("conduta")}
            className={cn(
              "inline-flex items-center gap-1.5 border-b-2 px-3.5 py-2 text-xs font-semibold transition-colors",
              activeTab === "conduta"
                ? "border-[#0284C7] text-[#0284C7] dark:text-sky-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            )}
          >
            <BookOpen className="h-3.5 w-3.5" />
            Conduta & Prescrição
          </button>

          {flowchartPages.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab("fluxogramas")}
              className={cn(
                "inline-flex items-center gap-1.5 border-b-2 px-3.5 py-2 text-xs font-semibold transition-colors",
                activeTab === "fluxogramas"
                  ? "border-[#0284C7] text-[#0284C7] dark:text-sky-400"
                  : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              )}
            >
              <GitBranch className="h-3.5 w-3.5" />
              Fluxogramas ({flowchartPages.length})
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveTab("paginas")}
            className={cn(
              "inline-flex items-center gap-1.5 border-b-2 px-3.5 py-2 text-xs font-semibold transition-colors",
              activeTab === "paginas"
                ? "border-[#0284C7] text-[#0284C7] dark:text-sky-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            )}
          >
            <FileText className="h-3.5 w-3.5" />
            Páginas Originais ({pagesToUse.length})
          </button>
        </div>
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

      {/* ABA 1: CONDUTA & PRESCRIÇÃO (TEXTO LIMPO, SELECIONÁVEL E COPIÁVEL) */}
      {activeTab === "conduta" && (
        <div className="space-y-4">
          {loadingChapter ? (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B] py-16 text-xs text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin text-[#0284C7]" />
              Consolidando protocolo completo...
            </div>
          ) : (
            <>
              {/* Receitas Modelo Verbatim já existentes no Manual */}
              {verbatimPrescriptions.map((p) => (
                <div
                  key={`rx-${p.numero_pagina}`}
                  className="rounded-xl border border-amber-300/80 dark:border-amber-700/70 bg-amber-50/70 dark:bg-amber-950/30 p-4"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-xs font-semibold text-amber-900 dark:text-amber-200">
                      <ClipboardList className="h-4 w-4 text-amber-600" />
                      Modelo de Receita do Manual (Pág. {p.numero_pagina})
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

              {/* Seções Consolidadas do Protocolo — Texto 100% Copiável */}
              <div className="rounded-xl border border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B] divide-y divide-[#E2E8F0] dark:divide-[#334155]">
                {pagesToUse.map((p) => (
                  <article key={p.numero_pagina} className="p-5">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                          {p.subtitulo_pagina || `Seção — Página ${p.numero_pagina}`}
                        </h3>
                        {p.possui_fluxograma && (
                          <button
                            type="button"
                            onClick={() => setActiveTab("fluxogramas")}
                            className="inline-flex items-center gap-1 rounded bg-indigo-500/10 px-2 py-0.5 text-[11px] font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/20"
                          >
                            <GitBranch className="h-3 w-3" />
                            Ver Fluxograma
                          </button>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          copyText(
                            `sec-${p.numero_pagina}`,
                            `${p.subtitulo_pagina}\n${p.texto_indexacao}`
                          )
                        }
                        title="Copiar esta seção"
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-[#0284C7]"
                      >
                        {copiedKey === `sec-${p.numero_pagina}` ? (
                          <>
                            <Check className="h-3 w-3 text-emerald-600" />
                            Copiado
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            Copiar
                          </>
                        )}
                      </button>
                    </div>

                    <p className="select-text whitespace-pre-line text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                      {p.texto_indexacao || "Consulte a imagem original na aba Fluxogramas / Páginas Originais."}
                    </p>
                  </article>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ABA 2 & 3: TODOS OS FLUXOGRAMAS OU PÁGINAS EMPILHADOS (SEM FOLHEAR) */}
      {(activeTab === "fluxogramas" || activeTab === "paginas") && (
        <div className="space-y-4">
          {loadingImgs && (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B] py-10 text-xs text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin text-[#0284C7]" />
              Carregando imagens em alta nitidez...
            </div>
          )}

          {(activeTab === "fluxogramas" ? flowchartPages : pagesToUse).map((p) => {
            const url = signedUrls[p.numero_pagina];
            return (
              <div
                key={`img-${p.numero_pagina}`}
                className="rounded-xl border border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B] overflow-hidden"
              >
                <div className="flex items-center justify-between gap-2 border-b border-[#E2E8F0] dark:border-[#334155] px-4 py-2.5 bg-slate-50/70 dark:bg-slate-800/40">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Pág. {p.numero_pagina} — {p.subtitulo_pagina || p.capitulo_tema}
                  </span>
                  {url && (
                    <button
                      type="button"
                      onClick={() => {
                        setFullscreenZoom(100);
                        setFullscreenImg({
                          url,
                          title: `Pág. ${p.numero_pagina} — ${p.subtitulo_pagina || item.titulo}`,
                        });
                      }}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-[#0284C7] dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-slate-700"
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
                      alt={`Página ${p.numero_pagina}`}
                      onClick={() => {
                        setFullscreenZoom(100);
                        setFullscreenImg({
                          url,
                          title: `Pág. ${p.numero_pagina} — ${p.subtitulo_pagina || item.titulo}`,
                        });
                      }}
                      className="max-w-full cursor-zoom-in rounded-lg bg-white shadow-sm"
                    />
                  ) : (
                    <div className="flex h-40 items-center gap-2 text-xs text-slate-400">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Carregando página {p.numero_pagina}...
                    </div>
                  )}
                </div>
              </div>
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
