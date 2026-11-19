"use client";

import Link from "next/link";
import { FaBookmark, FaHeart, FaRegHeart } from "react-icons/fa";
import SaveMaterialButton from "@/components/materials/SaveMaterialButton";
import { useSavedMaterials } from "@/hooks/api/useSavedMaterials";
import { useWallet } from "@/hooks/useWallet";
import EmptyState from "@/components/common/EmptyState";

export default function SavedMaterialsSection() {
	const { isConnected, connect, state } = useWallet();
	const { items, isLoading } = useSavedMaterials();

	return (
		<section className="p-6 bg-white border border-gray-100 rounded-xl shadow-sm">
			<div className="flex items-center justify-between mb-6">
				<div>
					<h3 className="font-bold text-gray-900 flex items-center gap-2">
						<FaBookmark className="text-indigo-500" /> Saved Materials
					</h3>
					<p className="text-xs text-gray-500 mt-1">Bookmark notes to compare and revisit later.</p>
				</div>
				<Link href="/marketplace" className="text-indigo-600 hover:text-indigo-700 font-medium text-sm">
					Browse
				</Link>
			</div>

			{!isConnected ? (
				<EmptyState
					headingLevel="h4"
					icon={<FaRegHeart className="text-2xl text-indigo-500" />}
					title="Connect your wallet to view saved materials"
					description="Your wishlist is tied to your wallet so it stays separate from other buyers."
					primaryAction={{
						label: state.status === "connecting" ? "Connecting..." : "Connect wallet",
						onClick: connect,
						disabled: state.status === "connecting" || state.status === "initializing",
					}}
					secondaryAction={{
						label: "Browse marketplace",
						href: "/marketplace",
					}}
				/>
			) : isLoading ? (
				<div className="grid sm:grid-cols-2 gap-4">
					{[1, 2].map((item) => (
						<div key={item} className="h-32 rounded-xl bg-gray-100 animate-pulse" />
					))}
				</div>
			) : items.length === 0 ? (
				<EmptyState
					headingLevel="h4"
					icon={<FaHeart className="text-2xl text-rose-400" />}
					title="No saved materials yet"
					description="Tap the heart on any marketplace card or material detail page to save it here."
					primaryAction={{
						label: "Browse marketplace",
						href: "/marketplace",
					}}
				/>
			) : (
				<div className="grid sm:grid-cols-2 gap-4">
					{items.slice(0, 4).map((material) => (
						<div key={material.id || material._id} className="relative rounded-xl border border-gray-100 bg-gray-50 p-4 pr-14 hover:border-indigo-200 transition">
							<SaveMaterialButton material={material} />
							<Link href={`/marketplace/${material._id || material.id}`} className="block">
								<h4 className="font-semibold text-sm text-gray-900 line-clamp-1 hover:text-indigo-600">{material.title}</h4>
								<p className="text-xs text-gray-500 mt-1 line-clamp-2">{material.description}</p>
								<div className="flex items-center justify-between mt-4 text-xs">
									<span className="text-gray-500">{material.subject || material.category || "Material"}</span>
									<span className="font-bold text-green-600">{material.price} {material.currency || "XLM"}</span>
								</div>
							</Link>
						</div>
					))}
				</div>
			)}
		</section>
	);
}
