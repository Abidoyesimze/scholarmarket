"use client";

import { useEffect } from "react";
import { captureException } from "@/lib/sentry";

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    captureException(error, { boundary: "global" });
  }, [error]);

  const reference = error?.digest ? String(error.digest).slice(-8).toUpperCase() : "UNKNOWN";

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#fffaf6" }}>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "4rem 1.5rem" }}>
          <section style={{ maxWidth: "36rem", width: "100%", textAlign: "center", background: "white", border: "1px solid #e2e8f0", borderRadius: "1.5rem", padding: "2rem", boxSizing: "border-box" }}>
            <p style={{ color: "#dc2626", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.2em", fontSize: "0.875rem" }}>
              Application error
            </p>
            <h1 style={{ color: "#0f172a", fontSize: "2rem", marginBottom: "0.75rem" }}>ScholarMarket could not load</h1>
            <p style={{ color: "#475569" }}>Please retry. If the problem continues, contact support.</p>
            <p style={{ color: "#64748b", fontFamily: "monospace", fontSize: "0.75rem" }}>Error reference: SM-{reference}</p>
            <button
              type="button"
              onClick={reset}
              style={{ marginTop: "1rem", border: 0, borderRadius: "0.75rem", background: "#2563eb", color: "white", padding: "0.75rem 1.25rem", fontWeight: 700, cursor: "pointer" }}
            >
              Try again
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
