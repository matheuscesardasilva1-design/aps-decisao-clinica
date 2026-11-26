import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
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

    const { data, error } = await supabase
      .from("perguntas_telessaude")
      .select("id, conteudo_html, texto_completo, referencias")
      .eq("id", context.params.id)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ error: "Pergunta não encontrada." }, { status: 404 });
    }

    return NextResponse.json({ detail: data });
  } catch (err) {
    console.error("[telessaude detail] Erro:", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
