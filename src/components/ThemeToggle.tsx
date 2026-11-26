"use client";

import * as React from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="h-9 w-9 rounded-lg border border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B]" />
    );
  }

  const cycleTheme = () => {
    if (theme === "system") {
      setTheme(resolvedTheme === "dark" ? "light" : "dark");
    } else if (theme === "light") {
      setTheme("dark");
    } else {
      setTheme("light");
    }
  };

  return (
    <button
      type="button"
      onClick={cycleTheme}
      title={
        resolvedTheme === "dark"
          ? "Alternar para Tema Claro"
          : "Alternar para Tema Escuro"
      }
      aria-label="Alternar tema claro ou escuro"
      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B] px-2.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-[#0284C7] dark:hover:border-sky-400 transition-colors"
    >
      {resolvedTheme === "dark" ? (
        <>
          <Sun className="h-4 w-4 text-amber-400" />
          <span className="hidden sm:inline">Claro</span>
        </>
      ) : (
        <>
          <Moon className="h-4 w-4 text-[#0284C7]" />
          <span className="hidden sm:inline">Escuro</span>
        </>
      )}
      {theme === "system" && (
        <Monitor className="h-3 w-3 text-slate-400 hidden md:inline" />
      )}
    </button>
  );
}
