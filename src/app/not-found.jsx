"use client";

import Link from "next/link";
import { FaArrowLeft, FaSearch } from "react-icons/fa";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-[#fffaf6] px-6 py-16 grid place-items-center">
      <section className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-blue-50 text-blue-600">
          <FaSearch aria-hidden="true" className="h-7 w-7" />
        </div>
        <p className="text-sm font-bold uppercase tracking-[0.25em] text-blue-600">404</p>
        <h1 className="mt-3 text-3xl font-bold text-slate-950">Page not found</h1>
        <p className="mt-3 text-slate-600">
          The page or resource you are looking for does not exist or is no longer available.
        </p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/marketplace"
            className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Browse Marketplace
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <FaArrowLeft aria-hidden="true" />
            Go to Dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
