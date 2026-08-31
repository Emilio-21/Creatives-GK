import { LibrarySkeleton, ShellSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <ShellSkeleton>
      <LibrarySkeleton />
    </ShellSkeleton>
  );
}
