"use client";

// Skeleton placeholder mirroring the marketplace MaterialCard dimensions
// so there is no layout shift when real data replaces the skeletons.
export default function MaterialCardSkeleton() {
	return (
		<article className="relative bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm flex flex-col">
			{/* Thumbnail (matches h-36 in MaterialCard) */}
			<div className="relative w-full h-36 bg-gray-100 overflow-hidden">
				<div className="absolute top-2 left-2 h-4 w-16 rounded-md bg-gray-200" />
				<div className="absolute top-2 right-2 h-4 w-14 rounded-md bg-gray-200" />
				<div className="absolute inset-0 animate-pulse bg-gray-100" />
			</div>

			<div className="p-4 flex-1 flex flex-col gap-2">
				<div className="h-3.5 w-4/5 rounded bg-gray-200 animate-pulse" />
				<div className="h-3 w-2/3 rounded bg-gray-100 animate-pulse" />

				<div className="h-4 w-24 rounded-full bg-gray-100 animate-pulse" />

				<div className="h-3 w-full rounded bg-gray-100 animate-pulse" />
				<div className="h-3 w-5/6 rounded bg-gray-100 animate-pulse" />

				<div className="mt-auto pt-3 border-t border-gray-100 space-y-3">
					<div className="flex justify-between items-center">
						<div className="h-3.5 w-16 rounded bg-gray-200 animate-pulse" />
						<div className="h-5 w-14 rounded-lg bg-gray-200 animate-pulse" />
					</div>

					<div className="grid grid-cols-2 gap-2">
						<div className="h-8 rounded-lg bg-gray-100 animate-pulse" />
						<div className="h-8 rounded-lg bg-gray-100 animate-pulse" />
					</div>
				</div>
			</div>
		</article>
	);
}
