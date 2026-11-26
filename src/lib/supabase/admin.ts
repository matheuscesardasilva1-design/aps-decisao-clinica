import { createClient } from "@supabase/supabase-js";

/**
 * Cliente administrativo usando SUPABASE_SERVICE_ROLE_KEY.
 * USO EXCLUSIVO EM ROUTE HANDLERS (BACKEND) APÓS VALIDAR SESSÃO AUTENTICADA.
 */
export function createAdminClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar configuradas no servidor."
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
