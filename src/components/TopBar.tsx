"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-6 border-b border-hairline bg-canvas px-4 sm:px-6">
      <span className="text-[15px] font-medium tracking-tight">Calendue</span>

      <nav className="flex items-center gap-4 text-sm">
        {(["calendar", "list"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onView(v)}
            className={
              view === v
                ? "border-b-2 border-accent pb-0.5 font-medium text-ink"
                : "border-b-2 border-transparent pb-0.5 text-muted transition-colors hover:text-ink"
            }
          >
            {v === "calendar" ? "Calendar" : "List"}
          </button>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-3">
        <button
          type="button"
          onClick={onAdd}
          onPointerEnter={() => {
            void import("@/components/CaptureModal");
          }}
          className="rounded-[6px] bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
        >
          Add deadlines
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Account menu"
            className="flex h-7 w-7 items-center justify-center rounded-full border border-hairline text-xs text-muted transition-colors hover:text-ink"
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
              <div className="absolute right-0 top-9 z-20 w-56 rounded-[8px] border border-hairline bg-canvas p-3 text-sm shadow-lg">
                <p className="mb-2 truncate text-xs text-muted">{email}</p>
                <button
                  type="button"
                  onClick={signOut}
                  className="text-muted transition-colors hover:text-ink"
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
