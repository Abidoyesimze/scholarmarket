"use client";

import { useEffect } from "react";
import Link from "next/link";
import { captureException } from "@/lib/sentry";

export default function Error({ error, reset }) {
  useEffect(() => {
    captureException(error, { boundary: "app" });
  }, [error]);

  const reference = error?.digest ? String(error.digest).slice(-8).toUpperCase() : "UNKNOWN";

  return (
    <main className="min-h-screen bg-[#fffaf6] px-6 py-16 grid place-items-center">
      <section className="w-full max-w-xl rounded-3xl border border-red-100 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-bold uppercase tracking-[0.25em] text-red-600">Something went wrong</p>
        <h1 className="mt-3 text-3xl font-bold text-slate-950">We could not load this page</h1>
        <p className="mt-3 text-slate-600">Try again, or return to the marketplace.</p>
        <p className="mt-4 text-xs font-mono text-slate-500">Error reference: SM-{reference}</p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={reset}
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Try again
          </button>
          <Link
            href="/marketplace"
            className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Browse Marketplace
          </Link>
        </div>
      </section>
    </main>
  );
}
