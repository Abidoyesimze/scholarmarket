"use client";

import { useEffect, useState } from "react";
import { useNotificationPreferences } from "@/hooks/useNotificationPreferences";

const ITEMS = [
  ["receipts", "Purchase receipts", "Transactional purchase confirmations and invoices."],
  ["reviews", "Review notifications", "Updates about reviews and moderation decisions."],
  ["sales", "Sales activity", "Notifications when a learner purchases your material."],
  ["reminders", "Inactivity reminders", "Friendly reminders to keep learning and publishing."],
  ["productUpdates", "Product updates", "News about ScholarMarket features and improvements."],
];

export default function NotificationPreferencesPanel() {
  const { data, isLoading, error, updatePreferences, isSaving, saveError } = useNotificationPreferences();
  const [preferences, setPreferences] = useState(null);

  useEffect(() => {
    if (data?.preferences) setPreferences({ ...data.preferences, receipts: true });
  }, [data]);

  const toggle = async (key) => {
    if (key === "receipts" || !preferences) return;
    const next = { ...preferences, [key]: !preferences[key], receipts: true };
    setPreferences(next);
    try {
      await updatePreferences(next);
    } catch {
      // The hook restores the previous optimistic state.
    }
  };

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">Notifications</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-950">Choose what reaches your inbox</h2>
        <p className="mt-2 text-sm text-slate-600">Preferences save automatically across sessions.</p>
      </div>

      {isLoading || !preferences ? (
        <div className="h-32 animate-pulse rounded-2xl bg-slate-100" />
      ) : (
        <div className="divide-y divide-slate-100">
          {ITEMS.map(([key, title, description]) => (
            <div key={key} className="flex items-center justify-between gap-6 py-5 first:pt-0">
              <div>
                <p className="font-medium text-slate-900">{title}</p>
                <p className="mt-1 text-sm text-slate-500">{description}</p>
                {key === "receipts" && <p className="mt-1 text-xs font-medium text-slate-400">Always enabled for transactions</p>}
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={preferences[key]}
                aria-label={title}
                disabled={key === "receipts" || isSaving}
                onClick={() => toggle(key)}
                className={`relative h-7 w-12 shrink-0 rounded-full transition ${preferences[key] ? "bg-blue-600" : "bg-slate-300"} disabled:cursor-not-allowed disabled:opacity-70`}
              >
                <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${preferences[key] ? "left-6" : "left-1"}`} />
              </button>
            </div>
          ))}
        </div>
      )}

      {(error || saveError) && <p className="mt-4 text-sm text-red-700">{error?.message || saveError?.message || "Unable to load notification preferences."}</p>}
      {data?.updatedAt && (
        <p className="mt-5 text-xs text-slate-500">
          Last saved {new Date(data.updatedAt).toLocaleString()}
        </p>
      )}
    </section>
  );
}
