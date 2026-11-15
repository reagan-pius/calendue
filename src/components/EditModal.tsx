"use client";

import { useEffect, useEffectEvent, useId, useState } from "react";
import {
  DEADLINE_TYPES,
  TYPE_COLORS,
  TYPE_LABELS,
  type Deadline,
  type DeadlineType,
} from "@/lib/deadlines/types";
import { combineLocal, splitIso } from "@/lib/dates";

interface EditModalProps {
  /** Existing deadline to edit, or null to create manually. */
  deadline: Deadline | null;
  onClose: () => void;
  onSaved: (d: Deadline) => void;
  onDeleted?: (id: string) => void;
}

const inputCls =
  "w-full rounded-[6px] border border-hairline bg-white px-2.5 py-1.5 text-sm outline-none focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent";
const labelCls = "mb-1 block text-[11px] text-muted";

// Manual create/edit after save (spec UX step 8): title/date/time/type/
// module/description + per-deadline color override.
export default function EditModal({ deadline, onClose, onSaved, onDeleted }: EditModalProps) {
  const titleId = useId();
  const creating = deadline === null;
  const initial = deadline?.due_at ? splitIso(deadline.due_at) : { date: "", time: "" };
  const [title, setTitle] = useState(deadline?.title ?? "");
  const [description, setDescription] = useState(deadline?.description ?? "");
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [type, setType] = useState<DeadlineType>(deadline?.type ?? "assignment");
  const [module, setModule] = useState(deadline?.module ?? "");
  const [color, setColor] = useState(deadline?.color ?? TYPE_COLORS.assignment);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        title,
        description: description || null,
        due_at: date ? combineLocal(date, time) : null,
        type,
        module: module || null,
        color,
      };
      if (creating) body.source = "manual";

      const res = await fetch(
        creating ? "/api/deadlines" : `/api/deadlines/${deadline.id}`,
        {
          method: creating ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const errBody = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errBody?.error ?? "Save failed");
      }
      onSaved((await res.json()) as Deadline);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!deadline || !onDeleted) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/deadlines/${deadline.id}`, { method: "DELETE" });
    if (res.ok) onDeleted(deadline.id);
    else setBusy(false);
  }

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (!busy && title.trim()) void save();
    }
  });

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        className="overlay-enter absolute inset-0 cursor-default bg-black/20"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="panel-enter relative w-full max-w-md overflow-y-auto overscroll-contain rounded-[12px] border border-hairline bg-canvas p-5"
      >
        <h3 id={titleId} className="mb-4 text-base font-medium tracking-tight">
          {creating ? "Add deadline" : "Edit deadline"}
        </h3>

        <div className="flex flex-col gap-3">
          <div>
            <label className={labelCls} htmlFor="edit-title">Title</label>
            <input
              id="edit-title"
              name="title"
              autoFocus
              className={inputCls}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="edit-date">Date</label>
              <input
                id="edit-date"
                name="date"
                type="date"
                className={inputCls}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="edit-time">Time</label>
              <input
                id="edit-time"
                name="time"
                type="time"
                className={inputCls}
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="edit-type">Type</label>
              <select
                id="edit-type"
                name="type"
                className={inputCls}
                value={type}
                onChange={(e) => {
                  const t = e.target.value as DeadlineType;
                  setType(t);
                  setColor(TYPE_COLORS[t]);
                }}
              >
                {DEADLINE_TYPES.map((t) => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="edit-module">Module</label>
              <input
                id="edit-module"
                name="module"
                className={inputCls}
                placeholder="e.g. CS101…"
                value={module}
                onChange={(e) => setModule(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className={labelCls} htmlFor="edit-color">Color</label>
            <div className="flex items-center gap-2">
              <input
                id="edit-color"
                name="color"
                type="color"
                className="h-7 w-10 cursor-pointer rounded-[6px] border border-hairline"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setColor(TYPE_COLORS[type])}
                className="text-[11px] text-muted underline-offset-2 hover:text-ink hover:underline"
              >
                Reset to {TYPE_LABELS[type].toLowerCase()} default
              </button>
            </div>
          </div>
          <div>
            <label className={labelCls} htmlFor="edit-desc">Description (optional)</label>
            <textarea
              id="edit-desc"
              name="description"
              rows={2}
              className={inputCls}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>

        {error && (
          <p className="mt-3 text-xs text-danger" role="alert" aria-live="polite">
            {error}
          </p>
        )}

        <div className="mt-5 flex items-center justify-between">
          {!creating && onDeleted ? (
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="text-xs text-muted underline-offset-2 hover:text-danger hover:underline disabled:opacity-50"
            >
              {confirmDelete ? "Confirm delete" : "Delete"}
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-[6px] border border-hairline px-3 py-1.5 text-sm text-muted hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy || !title.trim()}
              className="btn-press rounded-[6px] bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Saving…" : creating ? "Add" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
