"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export type View = "calendar" | "list";

interface TopBarProps {
  view: View;
  onView: (v: View) => void;
  onAdd: () => void;
  email: string;
}

// Spec app shell: wordmark · Calendar/List text toggle (accent underline,
// no pills) · Add deadlines · account menu.
export default function TopBar({ view, onView, onAdd, email }: TopBarProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  async function signOut() {
    await fetch("/auth/signout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-6 border-b border-hairline bg-canvas px-4 sm:px-6">
      <span className="text-base font-medium tracking-tight">Calendue</span>

      <nav className="flex items-center gap-5 text-sm" aria-label="Views">
        {(["calendar", "list"] as const).map((v) => {
          const active = view === v;
          return (
            <button
              key={v}
              type="button"
              onClick={() => onView(v)}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "border-b border-accent pb-0.5 font-medium text-ink"
                  : "border-b border-transparent pb-0.5 text-muted hover:text-ink"
              }
            >
              {v === "calendar" ? "Calendar" : "List"}
            </button>
          );
        })}
      </nav>

      <div className="ml-auto flex items-center gap-3">
        <button
          type="button"
          onClick={onAdd}
          onPointerEnter={() => {
            void import("@/components/CaptureModal");
          }}
          className="btn-press rounded-[6px] bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
        >
          Add deadlines
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Account menu"
            aria-expanded={menuOpen}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-hairline text-xs text-muted hover:text-ink"
          >
            {email.slice(0, 1).toUpperCase() || "?"}
          </button>
          {menuOpen && (
            <>
              <button
                type="button"
                aria-label="Close menu"
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setMenuOpen(false)}
              />
              <div
                role="menu"
                className="panel-enter absolute right-0 top-9 z-20 w-56 rounded-[8px] border border-hairline bg-canvas p-3 text-sm"
              >
                <p className="mb-2 truncate text-xs text-muted">{email}</p>
                <button
                  type="button"
                  role="menuitem"
                  onClick={signOut}
                  className="text-muted hover:text-ink"
                >
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
