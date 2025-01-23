interface LoadingPulseProps {
  className?: string;
}

export default function LoadingPulse({ className = '' }: LoadingPulseProps) {
  return <div className={`animate-pulse bg-dark-secondary rounded h-4 ${className}`} />;
}

interface LoadingPulseContainerProps {
  children: React.ReactNode;
  className?: string;
}

export function LoadingPulseContainer({ children, className = '' }: LoadingPulseContainerProps) {
  return (
    <div className={`animate-pulse bg-dark-secondary rounded ${className}`}>
      {children}
    </div>
  );
}

interface LoadingPulseGroupProps {
  count: number;
  className?: string;
  itemClassName?: string;
}

export function LoadingPulseGroup({ count, className = '', itemClassName = '' }: LoadingPulseGroupProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      {[...Array(count)].map((_, i) => (
        <LoadingPulse key={i} className={itemClassName} />
      ))}
    </div>
  );
}

interface LoadingPulseGridProps {
  count: number;
  cols?: number;
  className?: string;
  itemClassName?: string;
}

export function LoadingPulseGrid({ count, cols = 2, className = '', itemClassName = '' }: LoadingPulseGridProps) {
  return (
    <div className={`grid grid-cols-1 md:grid-cols-${cols} gap-4 ${className}`}>
      {[...Array(count)].map((_, i) => (
        <LoadingPulse key={i} className={itemClassName} />
      ))}
    </div>
  );
}

interface LoadingPulseCircleProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function LoadingPulseCircle({ size = 'md', className = '' }: LoadingPulseCircleProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  };

  return (
    <div className={`animate-pulse bg-dark-secondary rounded-full ${sizeClasses[size]} ${className}`} />
  );
}

interface LoadingPulseButtonProps {
  className?: string;
}

export function LoadingPulseButton({ className = '' }: LoadingPulseButtonProps) {
  return (
    <div className={`h-10 rounded-md bg-dark-secondary animate-pulse ${className}`} />
  );
}

interface LoadingPulseInputProps {
  className?: string;
}

export function LoadingPulseInput({ className = '' }: LoadingPulseInputProps) {
  return (
    <div className={`h-10 rounded-md bg-dark-primary animate-pulse ${className}`} />
  );
}

interface LoadingPulseBadgeProps {
  className?: string;
}

export function LoadingPulseBadge({ className = '' }: LoadingPulseBadgeProps) {
  return (
    <div className={`h-6 rounded-full bg-dark-secondary animate-pulse ${className}`} />
  );
}

interface LoadingPulseCardProps {
  className?: string;
  children: React.ReactNode;
}

export function LoadingPulseCard({ className = '', children }: LoadingPulseCardProps) {
  return (
    <div className={`card bg-dark-primary animate-pulse ${className}`}>
      {children}
    </div>
  );
}

interface LoadingPulseProgressProps {
  className?: string;
}

export function LoadingPulseProgress({ className = '' }: LoadingPulseProgressProps) {
  return (
    <div className={`h-2 rounded-full bg-dark-secondary animate-pulse ${className}`} />
  );
}

interface LoadingPulseAvatarProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function LoadingPulseAvatar({ size = 'md', className = '' }: LoadingPulseAvatarProps) {
  const sizeClasses = {
    sm: 'h-8 w-8',
    md: 'h-12 w-12',
    lg: 'h-16 w-16',
  };

  return (
    <div className={`animate-pulse bg-dark-secondary rounded-full ${sizeClasses[size]} ${className}`} />
  );
}
