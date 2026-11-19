import { notFound } from "next/navigation";
import { getDb } from "@/lib/mongodb";
import { buildMarketplaceSort } from "@/lib/backend/marketplaceDiscovery";
import CreatorProfileClient from "./CreatorProfileClient";

export const dynamic = "force-dynamic";

function serialize(value) {
  return JSON.parse(JSON.stringify(value, (_, item) =>
    item?.toJSON ? item.toJSON() : item,
  ));
}

async function getCreator(address) {
  const db = await getDb();
  const addressLower = address.toLowerCase();
  const profile = await db.collection("users").findOne({
    $or: [
      { walletAddress: address },
      { walletAddressLower: addressLower },
      { walletAddress: { $regex: `^${address.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}$`, $options: "i" } },
    ],
  });

  if (!profile) return null;

  const materials = await db.collection("materials").find({
    author: { $regex: `^${address.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}$`, $options: "i" },
    visibility: "public",
    status: "published",
  }).sort(buildMarketplaceSort("popular")).limit(10).toArray();

  return { profile: serialize(profile), materials: serialize(materials) };
}

export async function generateMetadata({ params }) {
  const { address } = await params;
  const creator = await getCreator(address);
  if (!creator) return { title: "Creator not found" };
  return {
    title: `${creator.profile.fullName || "Creator"} | ScholarMarket`,
    ...(creator.profile.avatarUrl && {
      openGraph: { images: [creator.profile.avatarUrl] },
    }),
  };
}

export default async function CreatorProfilePage({ params }) {
  const { address } = await params;
  const creator = await getCreator(address);
  if (!creator) notFound();

  return (
    <CreatorProfileClient
      address={address}
      initialProfile={creator.profile}
      initialMaterials={creator.materials}
    />
  );
}
