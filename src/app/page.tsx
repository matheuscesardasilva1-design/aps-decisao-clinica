import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ClinicalWorkspace } from "@/components/ClinicalWorkspace";
import { groupManualTopics } from "@/lib/topic-grouping";
import type { SearchResultItem } from "@/types/clinical";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Pré-carrega os dados direto no servidor (SSR) para abertura instantânea sem skeletons vazios
  let initialResults: SearchResultItem[] = [];
  try {
    const { data } = await supabase.rpc("buscar_conhecimento_clinico_v2", {
      query_text: "",
      query_embedding: null,
      filtro_categoria: "todos",
      incluir_arquivados: false,
      match_count: 50,
    });
    initialResults = groupManualTopics((data || []) as SearchResultItem[])
      .slice(0, 30)
      .map((item) => ({
        ...item,
        conteudo_html: null,
        texto_completo: null,
        referencias: null,
      }));
  } catch (err) {
    console.warn("[HomePage SSR] Fallback para carregamento client:", err);
  }

  return (
    <ClinicalWorkspace
      userEmail={user.email}
      initialResults={initialResults}
    />
  );
}
