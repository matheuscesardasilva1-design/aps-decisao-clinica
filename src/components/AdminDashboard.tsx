"use client";

import * as React from "react";
import {
  Upload,
  FileText,
  Archive,
  ArchiveRestore,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  Bot,
  Terminal,
  StopCircle,
} from "lucide-react";
import type {
  ManualCategoria,
  ManualRecord,
  SyncLogRecord,
} from "@/types/clinical";
import { formatDateTimeBR, sleep } from "@/lib/utils";

const CATEGORIES: ManualCategoria[] = [
  "Adulto APS",
  "Obstetrícia / Pré-Natal",
  "Saúde da Criança / Puericultura",
  "REMUME",
  "Protocolos",
];

export function AdminDashboard() {
  const [manuals, setManuals] = React.useState<ManualRecord[]>([]);
  const [syncLogs, setSyncLogs] = React.useState<SyncLogRecord[]>([]);
  const [stats, setStats] = React.useState({
    totalPerguntasTelessaude: 0,
    novasPerguntasTelessaude: 0,
  });
  const [loadingData, setLoadingData] = React.useState(true);
  const [dataError, setDataError] = React.useState<string | null>(null);

  // Estado do formulário de Upload/Ingestão PDF
  const [titulo, setTitulo] = React.useState("");
  const [categoria, setCategoria] = React.useState<ManualCategoria>("Adulto APS");
  const [versao, setVersao] = React.useState("");
  const [archivePrevious, setArchivePrevious] = React.useState(true);
  const [pdfFile, setPdfFile] = React.useState<File | null>(null);

  const [ingesting, setIngesting] = React.useState(false);
  const cancelRef = React.useRef(false);
  const [progress, setProgress] = React.useState({
    current: 0,
    total: 0,
    statusText: "",
  });
  const [ingestFeedback, setIngestFeedback] = React.useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Estado da sincronização TelessaúdeRS
  const [syncingTele, setSyncingTele] = React.useState(false);
  const [syncFeedback, setSyncFeedback] = React.useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const loadAdminData = React.useCallback(async () => {
    setLoadingData(true);
    setDataError(null);
    try {
      const res = await fetch("/api/admin/manuals", { cache: "no-store" });
      const data = (await res.json()) as {
        manuals?: ManualRecord[];
        syncLogs?: SyncLogRecord[];
        stats?: {
          totalPerguntasTelessaude: number;
          novasPerguntasTelessaude: number;
        };
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Erro ao carregar painel.");
      setManuals(data.manuals || []);
      setSyncLogs(data.syncLogs || []);
      if (data.stats) setStats(data.stats);
    } catch (err) {
      setDataError(err instanceof Error ? err.message : "Erro ao carregar dados.");
    } finally {
      setLoadingData(false);
    }
  }, []);

  React.useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  const handleIngestPdf = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pdfFile || !titulo.trim() || !versao.trim()) return;

    setIngesting(true);
    cancelRef.current = false;
    setIngestFeedback(null);
    setProgress({ current: 0, total: 0, statusText: "Carregando leitor de PDF..." });

    try {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

      const arrayBuffer = await pdfFile.arrayBuffer();
      const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const totalPages = pdfDoc.numPages;

      setProgress({
        current: 0,
        total: totalPages,
        statusText: `Registrando manual (${totalPages} páginas) e enviando PDF original...`,
      });

      const createRes = await fetch("/api/admin/manuals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: titulo.trim(),
          categoria,
          versao: versao.trim(),
          total_paginas: totalPages,
          archive_previous: archivePrevious,
        }),
      });
      const createData = (await createRes.json()) as {
        manual?: ManualRecord;
        pdfUpload?: { signedUrl: string };
        error?: string;
      };
      if (!createRes.ok || !createData.manual) {
        throw new Error(createData.error || "Falha ao criar registro do manual.");
      }

      const manual = createData.manual;

      // Upload do PDF original para o bucket privado manuais-pdfs via Signed Upload URL
      if (createData.pdfUpload?.signedUrl) {
        await fetch(createData.pdfUpload.signedUrl, {
          method: "PUT",
          headers: { "Content-Type": "application/pdf" },
          body: pdfFile,
        });
      }

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas 2D indisponível no navegador.");

      const scale = 150 / 72; // 150 DPI fiel
      let indexedCount = 0;

      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        if (cancelRef.current) {
          setIngestFeedback({
            type: "error",
            text: `Indexação interrompida na página ${pageNum - 1}/${totalPages}. Você pode retomar via script CLI.`,
          });
          break;
        }

        setProgress({
          current: pageNum,
          total: totalPages,
          statusText: `Renderizando e indexando página ${pageNum} de ${totalPages} (150 DPI WebP + Gemini)...`,
        });

        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);

        await page.render({ canvasContext: ctx, viewport }).promise;
        const webpDataUrl = canvas.toDataURL("image/webp", 0.82);

        const idxRes = await fetch("/api/admin/index-page", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            manualId: manual.id,
            manualTitulo: manual.titulo,
            manualCategoria: manual.categoria,
            pageNumber: pageNum,
            webpBase64: webpDataUrl,
          }),
        });

        if (!idxRes.ok) {
          const errJson = (await idxRes.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(
            `Erro na página ${pageNum}: ${errJson.error || idxRes.statusText}`
          );
        }

        indexedCount++;

        // Respeita o limite do Free Tier do Gemini entre páginas
        if (pageNum < totalPages && !cancelRef.current) {
          await sleep(4000);
        }
      }

      if (!cancelRef.current) {
        setIngestFeedback({
          type: "success",
          text: `Manual "${manual.titulo} (${manual.versao})" indexado com sucesso (${indexedCount}/${totalPages} páginas)!`,
        });
        setTitulo("");
        setVersao("");
        setPdfFile(null);
      }

      await loadAdminData();
    } catch (err) {
      setIngestFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Erro ao processar PDF.",
      });
    } finally {
      setIngesting(false);
    }
  };

  const handleToggleArchive = async (manual: ManualRecord) => {
    const res = await fetch(`/api/admin/manuals/${manual.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ arquivado: !manual.arquivado }),
    });
    if (res.ok) {
      await loadAdminData();
    }
  };

  const handleDeleteManual = async (manual: ManualRecord) => {
    const confirmed = window.confirm(
      `Excluir definitivamente "${manual.titulo} (${manual.versao})" e todas as suas ${manual.paginas_indexadas} páginas?`
    );
    if (!confirmed) return;

    const res = await fetch(`/api/admin/manuals/${manual.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      await loadAdminData();
    }
  };

  const handleManualSyncTelessaude = async () => {
    setSyncingTele(true);
    setSyncFeedback(null);
    try {
      const res = await fetch("/api/admin/sync-telessaude", { method: "POST" });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Falha ao sincronizar TelessaúdeRS.");
      }
      setSyncFeedback({
        type: "success",
        text: data.message || "Sincronização concluída!",
      });
      await loadAdminData();
    } catch (err) {
      setSyncFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Erro na captura manual.",
      });
    } finally {
      setSyncingTele(false);
    }
  };

  const lastLog = syncLogs[0] ?? null;
  const pct =
    progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : 0;

  return (
    <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#0F172A] dark:text-[#F1F5F9]">
            Administração Clínica & Automação
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Gerencie versões de manuais PDF (renderização 150 DPI WebP) e monitore
            o robô semanal do TelessaúdeRS-UFRGS.
          </p>
        </div>
        <button
          type="button"
          onClick={loadAdminData}
          disabled={loadingData}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B] px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-[#0284C7]"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loadingData ? "animate-spin" : ""}`} />
          Atualizar Painel
        </button>
      </div>

      {dataError && (
        <div className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 p-4 text-xs text-rose-700 dark:text-rose-300">
          {dataError}
        </div>
      )}

      {/* Grid Superior: Upload PDF + Status Robô TelessaúdeRS */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Upload e Indexação de Novo PDF */}
        <section className="rounded-2xl border border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B] p-5 lg:col-span-7">
          <div className="mb-4 flex items-center gap-2">
            <Upload className="h-4 w-4 text-[#0284C7]" />
            <h2 className="text-sm font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
              Upload e Indexação de Manual PDF
            </h2>
          </div>

          <form onSubmit={handleIngestPdf} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Título do Manual
                </label>
                <input
                  type="text"
                  required
                  disabled={ingesting}
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Ex: Manual da APS Adulto"
                  className="w-full rounded-lg border border-[#E2E8F0] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#0B1120] px-3 py-2 text-xs text-[#0F172A] dark:text-[#F1F5F9] focus:border-[#0284C7] focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Categoria
                </label>
                <select
                  disabled={ingesting}
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value as ManualCategoria)}
                  className="w-full rounded-lg border border-[#E2E8F0] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#0B1120] px-3 py-2 text-xs text-[#0F172A] dark:text-[#F1F5F9] focus:border-[#0284C7] focus:outline-none"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Versão / Edição
                </label>
                <input
                  type="text"
                  required
                  disabled={ingesting}
                  value={versao}
                  onChange={(e) => setVersao(e.target.value)}
                  placeholder="Ex: v1.5 - Out/2026"
                  className="w-full rounded-lg border border-[#E2E8F0] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#0B1120] px-3 py-2 text-xs text-[#0F172A] dark:text-[#F1F5F9] focus:border-[#0284C7] focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Arquivo PDF
                </label>
                <input
                  type="file"
                  accept="application/pdf"
                  required
                  disabled={ingesting}
                  onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                  className="w-full rounded-lg border border-[#E2E8F0] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#0B1120] px-2.5 py-1.5 text-xs text-slate-600 dark:text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-sky-50 dark:file:bg-sky-900/50 file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-[#0284C7] dark:file:text-sky-300"
                />
              </div>
            </div>

            <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                disabled={ingesting}
                checked={archivePrevious}
                onChange={(e) => setArchivePrevious(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-[#0284C7]"
              />
              Arquivar automaticamente versões anteriores com o mesmo título
            </label>

            {/* Barra de Progresso Página a Página */}
            {ingesting && (
              <div className="rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50/70 dark:bg-sky-950/30 p-3.5 space-y-2">
                <div className="flex items-center justify-between text-xs font-medium text-[#0284C7] dark:text-sky-300">
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {progress.statusText}
                  </span>
                  <span>{pct}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-sky-200/70 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#0284C7] to-[#0D9488] transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )}

            {ingestFeedback && (
              <div
                className={`rounded-lg border px-3 py-2.5 text-xs ${
                  ingestFeedback.type === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
                }`}
              >
                {ingestFeedback.text}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={ingesting || !pdfFile}
                className="inline-flex items-center gap-2 rounded-lg bg-[#0284C7] px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50 transition-colors"
              >
                {ingesting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Indexando...
                  </>
                ) : (
                  <>
                    <Upload className="h-3.5 w-3.5" />
                    Iniciar Upload & Indexação
                  </>
                )}
              </button>

              {ingesting && (
                <button
                  type="button"
                  onClick={() => {
                    cancelRef.current = true;
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                >
                  <StopCircle className="h-3.5 w-3.5" />
                  Interromper
                </button>
              )}
            </div>
          </form>

          {/* Dica CLI para PDFs extensos (200+ páginas) */}
          <div className="mt-4 rounded-xl border border-[#E2E8F0] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#0B1120] p-3 text-[11px] text-slate-600 dark:text-slate-400">
            <div className="mb-1 flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
              <Terminal className="h-3.5 w-3.5 text-[#0D9488]" />
              Para manuais extensos (ex: 271 páginas), prefira o script local com retomada automática:
            </div>
            <code className="block overflow-x-auto whitespace-pre rounded bg-slate-200/70 dark:bg-slate-800 px-2.5 py-1.5 font-mono text-[11px] text-slate-800 dark:text-slate-200">
              python scripts/ingest_pdf.py --pdf &quot;Manual_APS_v1.5.pdf&quot; --titulo &quot;Manual da APS Adulto&quot; --categoria &quot;Adulto APS&quot; --versao &quot;v1.5 - Out/2026&quot; --archive-previous
            </code>
          </div>
        </section>

        {/* Painel de Status do Robô TelessaúdeRS */}
        <section className="rounded-2xl border border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B] p-5 lg:col-span-5 flex flex-col justify-between gap-4">
          <div>
            <div className="mb-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-[#0D9488]" />
                <h2 className="text-sm font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                  Robô TelessaúdeRS-UFRGS
                </h2>
              </div>
              <span className="rounded-full bg-teal-100 dark:bg-teal-900/50 px-2.5 py-0.5 text-[11px] font-medium text-[#0D9488] dark:text-teal-300">
                Seg & Qui • 03:00 UTC
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-[#E2E8F0] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#0B1120] p-3">
                <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                  Perguntas na Base
                </span>
                <span className="mt-1 block text-2xl font-bold text-[#0F172A] dark:text-[#F1F5F9]">
                  {stats.totalPerguntasTelessaude}
                </span>
              </div>

              <div className="rounded-xl border border-[#E2E8F0] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#0B1120] p-3">
                <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                  Novas (Não Lidas)
                </span>
                <span className="mt-1 block text-2xl font-bold text-[#0D9488] dark:text-teal-400">
                  {stats.novasPerguntasTelessaude}
                </span>
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-[#E2E8F0] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#0B1120] p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">
                  Última execução:
                </span>
                <span className="font-medium text-[#0F172A] dark:text-[#F1F5F9]">
                  {lastLog ? formatDateTimeBR(lastLog.executado_em) : "Nunca executado"}
                </span>
              </div>
              {lastLog?.mensagem && (
                <p className="mt-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                  {lastLog.mensagem}
                </p>
              )}
            </div>

            {syncFeedback && (
              <div
                className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
                  syncFeedback.type === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
                }`}
              >
                {syncFeedback.text}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleManualSyncTelessaude}
            disabled={syncingTele}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#0D9488] px-4 py-2.5 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-60 transition-colors"
          >
            {syncingTele ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Capturando Perguntas da Semana...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Disparar Captura Manual Agora
              </>
            )}
          </button>
        </section>
      </div>

      {/* Lista de Manuais Cadastrados & Controle de Versão */}
      <section className="rounded-2xl border border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B] p-5">
        <div className="mb-4 flex items-center gap-2">
          <FileText className="h-4 w-4 text-[#0284C7]" />
          <h2 className="text-sm font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
            Manuais e Protocolos Indexados ({manuals.length})
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#E2E8F0] dark:border-[#334155] text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th className="pb-2.5 pr-4">Manual</th>
                <th className="pb-2.5 pr-4">Categoria</th>
                <th className="pb-2.5 pr-4">Versão</th>
                <th className="pb-2.5 pr-4">Páginas</th>
                <th className="pb-2.5 pr-4">Status</th>
                <th className="pb-2.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#334155]">
              {manuals.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    Nenhum manual indexado ainda. Use o formulário acima ou o script{" "}
                    <code className="font-mono">scripts/ingest_pdf.py</code>.
                  </td>
                </tr>
              ) : (
                manuals.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="py-3 pr-4 font-medium text-[#0F172A] dark:text-[#F1F5F9]">
                      {m.titulo}
                    </td>
                    <td className="py-3 pr-4 text-slate-600 dark:text-slate-300">
                      {m.categoria}
                    </td>
                    <td className="py-3 pr-4 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                      {m.versao}
                    </td>
                    <td className="py-3 pr-4 text-slate-600 dark:text-slate-300">
                      {m.paginas_indexadas} / {m.total_paginas}
                    </td>
                    <td className="py-3 pr-4">
                      {m.arquivado ? (
                        <span className="inline-flex items-center rounded-full bg-slate-200 dark:bg-slate-700 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:text-slate-300">
                          Arquivado
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                          Vigente
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleToggleArchive(m)}
                          title={m.arquivado ? "Restaurar versão vigente" : "Arquivar versão"}
                          className="inline-flex items-center gap-1 rounded-md border border-[#E2E8F0] dark:border-[#334155] px-2 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:border-[#0284C7]"
                        >
                          {m.arquivado ? (
                            <>
                              <ArchiveRestore className="h-3.5 w-3.5" />
                              Restaurar
                            </>
                          ) : (
                            <>
                              <Archive className="h-3.5 w-3.5" />
                              Arquivar
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteManual(m)}
                          title="Excluir manual e imagens"
                          className="inline-flex items-center rounded-md border border-rose-200 dark:border-rose-900/60 p-1 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Tabela sync_logs */}
      <section className="rounded-2xl border border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B] p-5">
        <h2 className="mb-4 text-sm font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
          Histórico de Execuções (sync_logs)
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#E2E8F0] dark:border-[#334155] text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th className="pb-2.5 pr-4">Data / Hora</th>
                <th className="pb-2.5 pr-4">Status</th>
                <th className="pb-2.5 pr-4">Novas</th>
                <th className="pb-2.5 pr-4">Verificadas</th>
                <th className="pb-2.5">Mensagem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#334155]">
              {syncLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">
                    Nenhuma execução registrada ainda.
                  </td>
                </tr>
              ) : (
                syncLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="py-2.5 pr-4 whitespace-nowrap text-slate-600 dark:text-slate-300">
                      {formatDateTimeBR(log.executado_em)}
                    </td>
                    <td className="py-2.5 pr-4">
                      {log.status === "sucesso" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                          <CheckCircle2 className="h-3 w-3" />
                          Sucesso
                        </span>
                      ) : log.status === "parcial" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-300">
                          <AlertTriangle className="h-3 w-3" />
                          Parcial
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:text-rose-300">
                          <XCircle className="h-3 w-3" />
                          Erro
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                      +{log.novas_perguntas}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-600 dark:text-slate-300">
                      {log.total_verificadas}
                    </td>
                    <td className="py-2.5 text-slate-600 dark:text-slate-300">
                      {log.mensagem || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
