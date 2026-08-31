import { DashboardSkeleton, ShellSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <ShellSkeleton>
      <DashboardSkeleton />
    </ShellSkeleton>
  );
}
