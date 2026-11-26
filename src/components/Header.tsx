"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Stethoscope, Settings, LogOut } from "lucide-react";
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
    <header className="sticky top-0 z-30 border-b border-[#E2E8F0]/80 dark:border-[#334155]/80 bg-white/80 dark:bg-[#0B1120]/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2.5 focus:outline-none group"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[#0284C7] to-[#0D9488] text-white shadow-sm">
            <Stethoscope className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold tracking-tight text-[#0F172A] dark:text-[#F1F5F9]">
            APS Clínica
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <Link
            href={pathname === "/admin" ? "/" : "/admin"}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <Settings className="h-3.5 w-3.5" />
            <span>{pathname === "/admin" ? "Início" : "Admin"}</span>
          </Link>

          <ThemeToggle />

          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            title={userEmail ? `Sair (${userEmail})` : "Sair"}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B] text-slate-500 hover:border-rose-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors disabled:opacity-50"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}
