import { SkeletonBase } from "@/components/common/DataSkeleton";

export default function CollectionsLoading() {
  return (
    <main className="container mx-auto min-h-[60vh] px-4 py-8">
      <div className="mb-8">
        <SkeletonBase className="h-9 w-72 max-w-full" />
        <SkeletonBase className="mt-3 h-5 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((item) => (
          <div key={item} className="h-48 rounded-xl border border-gray-200 bg-white p-6">
            <SkeletonBase className="h-6 w-3/4" />
            <SkeletonBase className="mt-4 h-4 w-full" />
            <SkeletonBase className="mt-2 h-4 w-5/6" />
            <SkeletonBase className="mt-10 h-4 w-36" />
          </div>
        ))}
      </div>
    </main>
  );
}
