import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ManualCategoria } from "@/types/clinical";

const VALID_CATEGORIES: ManualCategoria[] = [
  "Adulto APS",
  "Obstetrícia / Pré-Natal",
  "Saúde da Criança / Puericultura",
  "REMUME",
  "Protocolos",
];

export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const [manualsRes, logsRes, teleCountRes, teleNewCountRes] = await Promise.all([
      supabase
        .from("manuais")
        .select("*")
        .order("arquivado", { ascending: true })
        .order("updated_at", { ascending: false }),
      supabase
        .from("sync_logs")
        .select("*")
        .order("executado_em", { ascending: false })
        .limit(25),
      supabase
        .from("perguntas_telessaude")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("perguntas_telessaude")
        .select("id", { count: "exact", head: true })
        .eq("is_new", true),
    ]);

    if (manualsRes.error) {
      throw manualsRes.error;
    }

    return NextResponse.json({
      manuals: manualsRes.data || [],
      syncLogs: logsRes.data || [],
      stats: {
        totalPerguntasTelessaude: teleCountRes.count ?? 0,
        novasPerguntasTelessaude: teleNewCountRes.count ?? 0,
      },
    });
  } catch (err) {
    console.error("[admin/manuals GET] Erro:", err);
    return NextResponse.json(
      { error: "Erro ao carregar dados administrativos." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      titulo?: string;
      categoria?: string;
      versao?: string;
      total_paginas?: number;
      archive_previous?: boolean;
    };

    const titulo = (body.titulo || "").trim();
    const versao = (body.versao || "").trim();
    const categoria = body.categoria as ManualCategoria;
    const totalPaginas = Math.max(1, Number(body.total_paginas) || 1);
    const archivePrevious = Boolean(body.archive_previous);

    if (!titulo || !versao || !VALID_CATEGORIES.includes(categoria)) {
      return NextResponse.json(
        { error: "Informe título, categoria válida e versão do manual." },
        { status: 400 }
      );
    }

    if (archivePrevious) {
      await supabase
        .from("manuais")
        .update({ arquivado: true })
        .eq("titulo", titulo)
        .neq("versao", versao);
    }

    const { data: manual, error } = await supabase
      .from("manuais")
      .upsert(
        {
          titulo,
          categoria,
          versao,
          total_paginas: totalPaginas,
          arquivado: false,
        },
        { onConflict: "titulo,versao" }
      )
      .select()
      .single();

    if (error || !manual) {
      console.error("[admin/manuals POST] Erro:", error);
      return NextResponse.json({ error: "Erro ao registrar manual." }, { status: 500 });
    }

    const pdfPath = `${manual.id}/manual.pdf`;
    const { data: signedUpload } = await supabase.storage
      .from("manuais-pdfs")
      .createSignedUploadUrl(pdfPath, { upsert: true });

    await supabase
      .from("manuais")
      .update({ pdf_storage_path: pdfPath })
      .eq("id", manual.id);

    return NextResponse.json({
      manual: { ...manual, pdf_storage_path: pdfPath },
      pdfUpload: signedUpload
        ? {
            path: pdfPath,
            signedUrl: signedUpload.signedUrl,
            token: signedUpload.token,
          }
        : null,
    });
  } catch (err) {
    console.error("[admin/manuals POST] Erro inesperado:", err);
    return NextResponse.json({ error: "Erro interno ao criar manual." }, { status: 500 });
  }
}
