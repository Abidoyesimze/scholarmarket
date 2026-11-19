const SAFE_FIELDS = new Set([
  "event",
  "route",
  "method",
  "status",
  "reason",
  "actor",
  "walletAddress",
  "materialId",
  "cursor",
  "eventId",
  "target",
]);

export function auditLog(fields) {
  const entry = { timestamp: new Date().toISOString() };

  for (const [key, value] of Object.entries(fields || {})) {
    if (SAFE_FIELDS.has(key) && value !== undefined && value !== null) {
      entry[key] = String(value).slice(0, 300);
    }
  }

  console.info(JSON.stringify(entry));

  void import("../mongodb.js")
    .then(async ({ getDb }) => {
      const db = await getDb();
      await db.collection("audit_logs").insertOne({
        ...entry,
        action: entry.event || entry.action || "unknown",
        target: entry.target || entry.materialId || entry.walletAddress || null,
        createdAt: new Date(entry.timestamp),
      });
    })
    .catch(() => {});
}
