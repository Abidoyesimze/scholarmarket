import { SkeletonBase } from "@/components/common/DataSkeleton";

export default function MaterialDetailLoading() {
  return (
    <main className="min-h-screen bg-[#fffaf6] px-4 py-8 sm:px-6 lg:px-20">
      <div className="mx-auto max-w-6xl">
        <SkeletonBase className="mb-6 h-5 w-64" />
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,.55fr)]">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <SkeletonBase className="h-72 w-full rounded-2xl sm:h-96" />
            <SkeletonBase className="mt-6 h-9 w-3/4" />
            <SkeletonBase className="mt-3 h-5 w-1/2" />
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[1, 2, 3, 4].map((item) => (
                <SkeletonBase key={item} className="h-20 rounded-2xl" />
              ))}
            </div>
          </section>
          <aside className="space-y-5">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <SkeletonBase className="h-8 w-32" />
              <SkeletonBase className="mt-5 h-12 w-full rounded-xl" />
              <SkeletonBase className="mt-3 h-12 w-full rounded-xl" />
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <SkeletonBase className="h-5 w-24" />
              <div className="mt-4 flex items-center gap-3">
                <SkeletonBase className="h-14 w-14 rounded-2xl" />
                <div className="flex-1 space-y-2">
                  <SkeletonBase className="h-4 w-40 max-w-full" />
                  <SkeletonBase className="h-3 w-28" />
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
