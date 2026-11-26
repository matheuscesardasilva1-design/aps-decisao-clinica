import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const path = request.nextUrl.searchParams.get("path")?.trim();
    if (!path || path.includes("..")) {
      return NextResponse.json({ error: "Caminho de imagem inválido." }, { status: 400 });
    }

    // Signed URL temporária válida por 10 minutos (600s) — bucket privado paginas-webp
    const { data, error } = await supabase.storage
      .from("paginas-webp")
      .createSignedUrl(path, 600);

    if (error || !data?.signedUrl) {
      console.error("[page-image] Erro ao gerar Signed URL:", error);
      return NextResponse.json(
        { error: "Não foi possível gerar link seguro para a imagem da página." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      signedUrl: data.signedUrl,
      expiresIn: 600,
    });
  } catch (err) {
    console.error("[page-image] Erro inesperado:", err);
    return NextResponse.json({ error: "Erro interno ao carregar página." }, { status: 500 });
  }
}
