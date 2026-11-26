"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Stethoscope,
  Settings,
  Search,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/ThemeToggle";

interface HeaderProps {
  userEmail?: string | null;
}

export function Header({ userEmail }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = React.useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.replace("/login");
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <header className="sticky top-0 z-30 border-b border-[#E2E8F0] dark:border-[#334155] bg-white/90 dark:bg-[#0B1120]/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-2.5 group focus:outline-none"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#0284C7] to-[#0D9488] text-white shadow-sm">
              <Stethoscope className="h-4 w-4" />
            </div>
            <div className="leading-tight">
              <span className="block text-sm font-semibold tracking-tight text-[#0F172A] dark:text-[#F1F5F9]">
                APS Decisão Clínica
              </span>
              <span className="hidden sm:flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                <ShieldCheck className="h-3 w-3 text-[#0D9488]" />
                Uso Privado • Consultório APS
              </span>
            </div>
          </Link>

          <nav className="ml-2 flex items-center gap-1">
            <Link
              href="/"
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                pathname === "/"
                  ? "bg-sky-50 text-[#0284C7] dark:bg-sky-950/60 dark:text-sky-300"
                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <Search className="h-3.5 w-3.5" />
              Consulta Rápida
            </Link>
            <Link
              href="/admin"
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                pathname === "/admin"
                  ? "bg-sky-50 text-[#0284C7] dark:bg-sky-950/60 dark:text-sky-300"
                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <Settings className="h-3.5 w-3.5" />
              Admin
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-2.5">
          {userEmail && (
            <span className="hidden lg:inline-block max-w-[200px] truncate rounded-md bg-slate-100 dark:bg-slate-800/80 px-2.5 py-1 text-[11px] text-slate-600 dark:text-slate-300">
              {userEmail}
            </span>
          )}
          <ThemeToggle />
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            title="Sair da sessão"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B] px-2.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-rose-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors disabled:opacity-50"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sair</span>
          </button>
        </div>
      </div>
    </header>
  );
}
