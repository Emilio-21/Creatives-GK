import { LibrarySkeleton, StatsSkeleton } from "@/components/skeletons";
export default function Loading() {
  return (
    <>
      <div className="space-y-6">
        <StatsSkeleton />
        <LibrarySkeleton />
      </div>
    </>
  );
}
