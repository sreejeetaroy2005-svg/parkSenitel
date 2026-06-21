import React from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

const sizeMap = {
  sm: 'w-4 h-4 border-2',
  md: 'w-8 h-8 border-2',
  lg: 'w-12 h-12 border-3',
};

/**
 * Amber-accented loading spinner using CSS border animation.
 * The amber arc spins on a dark asphalt ring.
 */
export function LoadingSpinner({ size = 'md', label }: LoadingSpinnerProps): React.JSX.Element {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3"
      role="status"
      aria-label={label ?? 'Loading…'}
    >
      <div
        className={`${sizeMap[size]} rounded-full border-border border-t-accent animate-spin-amber`}
        aria-hidden="true"
      />
      {label && (
        <span className="text-secondary-text text-sm font-body">{label}</span>
      )}
    </div>
  );
}
