"use client";

import { useEffect } from "react";
import Link from "next/link";
import { captureException } from "@/lib/sentry";

export default function DashboardError({ error, reset }) {
  useEffect(() => {
    captureException(error, { boundary: "dashboard" });
  }, [error]);

  const reference = error?.digest ? String(error.digest).slice(-8).toUpperCase() : "UNKNOWN";

  return (
    <section role="alert" className="mx-auto my-10 max-w-xl rounded-2xl border border-red-100 bg-white p-8 text-center shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-600">Dashboard error</p>
      <h2 className="mt-2 text-2xl font-bold text-slate-950">This dashboard section failed to load</h2>
      <p className="mt-3 text-sm text-slate-600">Reference: SM-{reference}</p>
      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
        <button type="button" onClick={reset} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700">
          Try again
        </button>
        <Link href="/marketplace" className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Browse Marketplace
        </Link>
      </div>
    </section>
  );
}
