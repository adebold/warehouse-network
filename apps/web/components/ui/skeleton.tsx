import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('bg-muted animate-pulse rounded-md', className)} {...props} />;
}

export { Skeleton };
// Auto-generated skeleton components
export const SkeletonCard = Skeleton
export const SkeletonList = Skeleton
export const SkeletonTable = Skeleton
export const Spinner = () => <div className="animate-spin h-4 w-4 border-2 border-gray-300 rounded-full border-t-transparent" />
export const LoadingOverlay = ({ children }: { children?: React.ReactNode }) => (
  <div className="relative">
    <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
      <Spinner />
    </div>
    {children}
  </div>
)
