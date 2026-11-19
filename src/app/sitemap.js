import { getDb } from "@/lib/mongodb";

const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "http://localhost:3000";
const STATIC_PATHS = ["/", "/marketplace", "/about", "/contact"];

export async function generateSitemaps() {
  const db = await getDb();
  const count = await db.collection("materials").countDocuments({ status: "published", visibility: "public" });
  return Array.from({ length: Math.max(1, Math.ceil(count / 50000)) }, (_, id) => ({ id }));
}

export default async function sitemap({ id = 0 } = {}) {
  const db = await getDb();
  const [materials, creators] = await Promise.all([
    db.collection("materials").find({ status: "published", visibility: "public" })
      .sort({ publishedAt: -1 }).skip(id * 50000).limit(50000).project({ _id: 1, updatedAt: 1, publishedAt: 1 }).toArray(),
    db.collection("users").find({ walletAddress: { $exists: true, $ne: "" } })
      .project({ walletAddress: 1, updatedAt: 1 }).toArray(),
  ]);
  const now = new Date();
  return [
    ...STATIC_PATHS.map((path) => ({ url: `${SITE_ORIGIN}${path}`, lastModified: now })),
    ...materials.map((material) => ({ url: `${SITE_ORIGIN}/marketplace/${material._id}`, lastModified: material.updatedAt || material.publishedAt || now })),
    ...creators.map((creator) => ({ url: `${SITE_ORIGIN}/creator/${creator.walletAddress}`, lastModified: creator.updatedAt || now })),
  ];
}
