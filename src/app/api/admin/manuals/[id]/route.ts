import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as { arquivado?: boolean };
    if (typeof body.arquivado !== "boolean") {
      return NextResponse.json({ error: "Campo arquivado (boolean) é obrigatório." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("manuais")
      .update({ arquivado: body.arquivado })
      .eq("id", context.params.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: "Falha ao atualizar status do manual." }, { status: 500 });
    }

    return NextResponse.json({ manual: data });
  } catch (err) {
    console.error("[admin/manuals PATCH] Erro:", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const manualId = context.params.id;

    // Lista páginas para limpeza no Storage
    const { data: pages } = await supabase
      .from("manual_paginas")
      .select("imagem_webp_path")
      .eq("manual_id", manualId);

    const webpPaths = (pages || []).map((p) => p.imagem_webp_path).filter(Boolean);
    if (webpPaths.length > 0) {
      await supabase.storage.from("paginas-webp").remove(webpPaths);
    }

    await supabase.storage.from("manuais-pdfs").remove([`${manualId}/manual.pdf`]);

    const { error } = await supabase.from("manuais").delete().eq("id", manualId);
    if (error) {
      return NextResponse.json({ error: "Falha ao excluir manual." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/manuals DELETE] Erro:", err);
    return NextResponse.json({ error: "Erro interno ao excluir manual." }, { status: 500 });
  }
}
