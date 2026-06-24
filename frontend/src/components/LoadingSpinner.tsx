import React from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

const sizeMap = {
  sm: { ring: 'w-5 h-5', border: 'border-2' },
  md: { ring: 'w-8 h-8', border: 'border-2' },
  lg: { ring: 'w-14 h-14', border: 'border-[3px]' },
};

export function LoadingSpinner({ size = 'md', label }: LoadingSpinnerProps): React.JSX.Element {
  const { ring, border } = sizeMap[size];
  return (
    <div
      className="flex flex-col items-center justify-center gap-4"
      role="status"
      aria-label={label ?? 'Loading…'}
    >
      <div className="relative">
        {/* Outer static ring */}
        <div className={`${ring} ${border} rounded-full border-border`} aria-hidden="true" />
        {/* Inner spinning arc */}
        <div
          className={`absolute inset-0 ${ring} ${border} rounded-full border-transparent border-t-accent animate-spin-amber`}
          aria-hidden="true"
        />
        {/* Glow effect for large variant */}
        {size === 'lg' && (
          <div
            className="absolute inset-0 rounded-full animate-pulse-amber"
            aria-hidden="true"
          />
        )}
      </div>
      {label && (
        <span className="text-secondary-text text-sm font-body tracking-wide animate-fade-in">
          {label}
        </span>
      )}
    </div>
  );
}
