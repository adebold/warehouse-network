import { cn } from '@/lib/utils';

interface DashboardHeaderProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}

export function DashboardHeader({
  title,
  description,
  children,
  className
}: DashboardHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between space-y-2 pb-6', className)}>
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        {description && (
          <p className="text-muted-foreground">{description}</p>
        )}
      </div>
      {children && (
        <div className="flex items-center space-x-2">
          {children}
        </div>
      )}
    </div>
  );
}