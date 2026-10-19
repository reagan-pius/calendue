"use client";

import { useState } from "react";
import {
  DEADLINE_TYPES,
  TYPE_COLORS,
  TYPE_LABELS,
  type Deadline,
  type DeadlineType,
} from "@/lib/deadlines/types";
import { combineLocal, splitIso } from "@/lib/dates";

interface EditModalProps {
  deadline: Deadline;
  onClose: () => void;
  onSaved: (d: Deadline) => void;
  onDeleted: (id: string) => void;
}

const inputCls =
  "w-full rounded-[6px] border border-hairline bg-white px-2.5 py-1.5 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent";
const labelCls = "mb-1 block text-[11px] text-muted";

// Manual create/edit after save (spec UX step 8): title/date/time/type/
// module/description + per-deadline color override.
export default function EditModal({ deadline, onClose, onSaved, onDeleted }: EditModalProps) {
  const initial = deadline.due_at ? splitIso(deadline.due_at) : { date: "", time: "" };
  const [title, setTitle] = useState(deadline.title);
  const [description, setDescription] = useState(deadline.description ?? "");
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [type, setType] = useState<DeadlineType>(deadline.type);
  const [module, setModule] = useState(deadline.module ?? "");
  const [color, setColor] = useState(deadline.color ?? TYPE_COLORS[deadline.type]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/deadlines/${deadline.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: description || null,
          due_at: date ? combineLocal(date, time) : null,
          type,
          module: module || null,
          color,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Save failed");
      }
      onSaved((await res.json()) as Deadline);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    const res = await fetch(`/api/deadlines/${deadline.id}`, { method: "DELETE" });
    if (res.ok) onDeleted(deadline.id);
    else setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 cursor-default bg-black/20"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md rounded-[12px] border border-hairline bg-canvas p-5 shadow-lg">
        <h3 className="mb-4 text-sm font-medium">Edit deadline</h3>

        <div className="flex flex-col gap-3">
          <div>
            <label className={labelCls} htmlFor="edit-title">Title</label>
            <input id="edit-title" className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="edit-date">Date</label>
              <input id="edit-date" type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className={labelCls} htmlFor="edit-time">Time</label>
              <input id="edit-time" type="time" className={inputCls} value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="edit-type">Type</label>
              <select
                id="edit-type"
                className={inputCls}
                value={type}
                onChange={(e) => {
                  const t = e.target.value as DeadlineType;
                  setType(t);
                  setColor(TYPE_COLORS[t]); // reset to new type default
                }}
              >
                {DEADLINE_TYPES.map((t) => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="edit-module">Module</label>
              <input id="edit-module" className={inputCls} placeholder="e.g. CS101" value={module} onChange={(e) => setModule(e.target.value)} />
            </div>
          </div>
          <div>
            <label className={labelCls} htmlFor="edit-color">Color</label>
            <div className="flex items-center gap-2">
              <input id="edit-color" type="color" className="h-7 w-10 cursor-pointer rounded-[6px] border border-hairline" value={color} onChange={(e) => setColor(e.target.value)} />
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
            <textarea id="edit-desc" rows={2} className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>

        {error && <p className="mt-3 text-xs text-[#DC2626]">{error}</p>}

        <div className="mt-5 flex items-center justify-between">
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="text-xs text-muted underline-offset-2 hover:text-[#DC2626] hover:underline disabled:opacity-50"
          >
            Delete
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-[6px] border border-hairline px-3 py-1.5 text-sm text-muted transition-colors hover:text-ink">
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy || !title.trim()}
              className="rounded-[6px] bg-accent px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
