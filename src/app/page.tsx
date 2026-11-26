import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ClinicalWorkspace } from "@/components/ClinicalWorkspace";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <ClinicalWorkspace userEmail={user.email} />;
}
