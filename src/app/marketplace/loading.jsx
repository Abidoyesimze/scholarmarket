import MaterialCardSkeleton from "@/components/materials/MaterialCardSkeleton";
import { SkeletonBase } from "@/components/common/DataSkeleton";

export default function MarketplaceLoading() {
  return (
    <main className="min-h-screen bg-[#fffaf6] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <SkeletonBase className="h-9 w-64 max-w-full" />
          <SkeletonBase className="mt-3 h-5 w-96 max-w-full" />
        </div>
        <div className="mb-6 flex flex-wrap gap-3">
          {[1, 2, 3, 4].map((item) => (
            <SkeletonBase key={item} className="h-10 w-24 rounded-full" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((item) => (
            <MaterialCardSkeleton key={item} />
          ))}
        </div>
      </div>
    </main>
  );
}
