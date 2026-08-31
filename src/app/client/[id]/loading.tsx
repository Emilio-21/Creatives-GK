import { LibrarySkeleton, ShellSkeleton, StatsSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <ShellSkeleton>
      <div className="space-y-6">
        <StatsSkeleton />
        <LibrarySkeleton />
      </div>
    </ShellSkeleton>
  );
}
