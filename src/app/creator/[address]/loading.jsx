import { SkeletonBase } from "@/components/common/DataSkeleton";
import MaterialCardSkeleton from "@/components/materials/MaterialCardSkeleton";

export default function CreatorProfileLoading() {
  return (
    <main className="min-h-screen bg-[#fffaf6] px-4 py-8 sm:px-6 lg:px-20">
      <div className="mx-auto max-w-6xl">
        <section className="mb-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <SkeletonBase className="h-28 w-28 shrink-0 rounded-2xl" />
            <div className="flex-1 space-y-3">
              <SkeletonBase className="h-8 w-64 max-w-full" />
              <SkeletonBase className="h-4 w-96 max-w-full" />
              <div className="flex flex-wrap gap-3 pt-2">
                <SkeletonBase className="h-12 w-28 rounded-xl" />
                <SkeletonBase className="h-12 w-28 rounded-xl" />
                <SkeletonBase className="h-12 w-28 rounded-xl" />
              </div>
            </div>
          </div>
        </section>
        <SkeletonBase className="mb-5 h-10 w-64 rounded-lg" />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((item) => (
            <MaterialCardSkeleton key={item} />
          ))}
        </div>
      </div>
    </main>
  );
}
