import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
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

    const id = context.params.id;
    if (!id) {
      return NextResponse.json({ error: "ID inválido." }, { status: 400 });
    }

    const { error } = await supabase
      .from("perguntas_telessaude")
      .update({ is_new: false })
      .eq("id", id);

    if (error) {
      console.error("[telessaude/read] Erro:", error);
      return NextResponse.json({ error: "Falha ao atualizar status de leitura." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id, is_new: false });
  } catch (err) {
    console.error("[telessaude/read] Erro inesperado:", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
