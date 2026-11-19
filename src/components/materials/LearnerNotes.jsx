"use client";

import { useState } from "react";
import { useMaterialNote, useSaveMaterialNote } from "@/hooks/api/useMaterials";

/**
 * LearnerNotes — personal notes saved per user per resource.
 * Notes are persisted via /api/materials/[id]/notes.
 */
export default function LearnerNotes({ materialId, walletAddress }) {
  const noteQuery = useMaterialNote(materialId, { enabled: !!walletAddress });
  const saveNote = useSaveMaterialNote(materialId);

  // A 404 just means no note exists yet.
  const loadError = noteQuery.error && noteQuery.error.status !== 404 ? noteQuery.error : null;
  const savedNote = noteQuery.isSuccess || noteQuery.error?.status === 404 ? noteQuery.data?.note ?? "" : null;

  // Local edits; `null` means "showing the saved value".
  const [draft, setDraft] = useState(null);
  const note = draft ?? savedNote ?? "";
  const error = saveNote.error?.message || (loadError ? loadError.message || "Failed to load notes." : null);

  function handleSave() {
    saveNote.mutate(note, { onSuccess: () => setDraft(null) });
  }

  if (noteQuery.isLoading) {
    return (
      <section
        aria-label="Your notes"
        className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm mt-10 animate-pulse h-40"
      />
    );
  }

  return (
    <section
      aria-label="Your notes"
      className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm mt-10"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Your Notes</h2>
        {savedNote !== null && (
          <p className="text-xs text-gray-400">
            {savedNote.trim() ? "Notes saved" : "No notes yet"}
          </p>
        )}
      </div>

      {!savedNote && !note.trim() ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500 text-center mb-4">
          You haven&apos;t added any notes for this resource yet. Use the area below to jot down
          key takeaways or reminders.
        </div>
      ) : null}

      <textarea
        value={note}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Write your personal notes here…"
        rows={5}
        aria-label="Personal notes for this resource"
        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800 placeholder:text-gray-400 resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      <div className="mt-3 flex items-center justify-between">
        <button
          onClick={handleSave}
          disabled={saveNote.isPending || note === (savedNote ?? "")}
          className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          {saveNote.isPending ? "Saving…" : "Save Notes"}
        </button>
        {savedNote && savedNote.trim() && (
          <p className="text-xs text-gray-400">Auto-saved per resource</p>
        )}
      </div>
    </section>
  );
}
