import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { synthesizeClinicalSources } from "@/lib/gemini";
import type { SearchResultItem } from "@/types/clinical";

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
      query?: string;
      sources?: SearchResultItem[];
    };

    const query = (body.query || "").trim();
    const sources = Array.isArray(body.sources) ? body.sources.slice(0, 5) : [];

    if (!query || sources.length === 0) {
      return NextResponse.json(
        { error: "Informe uma dúvida clínica e ao menos uma fonte recuperada." },
        { status: 400 }
      );
    }

    const synthesis = await synthesizeClinicalSources(query, sources);
    return NextResponse.json({ synthesis });
  } catch (err) {
    console.error("[synthesize] Erro:", err);
    return NextResponse.json(
      { error: "Não foi possível gerar a síntese cruzada com IA no momento." },
      { status: 500 }
    );
  }
}
