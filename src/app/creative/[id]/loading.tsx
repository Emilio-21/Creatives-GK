import { DetailSkeleton, ShellSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <ShellSkeleton>
      <DetailSkeleton />
    </ShellSkeleton>
  );
}
