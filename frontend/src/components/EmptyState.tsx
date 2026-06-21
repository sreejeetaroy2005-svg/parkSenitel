import React from 'react';

interface EmptyStateProps {
  variant: 'no-station' | 'no-hotspots' | 'error';
  message?: string;
  onRetry?: () => void;
}

const icons = {
  'no-station': (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
      <circle cx="12" cy="9" r="2.5"/>
    </svg>
  ),
  'no-hotspots': (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8"/>
      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
      <line x1="8" y1="11" x2="14" y2="11"/>
    </svg>
  ),
  'error': (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  ),
};

const defaults = {
  'no-station': 'Select a police station to view hotspots',
  'no-hotspots': 'No hotspots found for this area',
  'error': 'Failed to load data',
};

const colors = {
  'no-station': 'text-muted',
  'no-hotspots': 'text-secondary-text',
  'error': 'text-danger-light',
};

/**
 * Empty / error state component shown in the map area or table.
 */
export function EmptyState({ variant, message, onRetry }: EmptyStateProps): React.JSX.Element {
  return (
    <div
      className="flex flex-col items-center justify-center gap-4 h-full w-full animate-fade-in"
      role="status"
      aria-live="polite"
    >
      <div className={`${colors[variant]} opacity-40`}>
        {icons[variant]}
      </div>
      <p className={`font-display text-lg tracking-wide ${colors[variant]} text-center px-8`}>
        {message ?? defaults[variant]}
      </p>
      {variant === 'error' && onRetry && (
        <button
          id="empty-state-retry-btn"
          onClick={onRetry}
          className="
            mt-1 px-5 py-2 rounded text-sm font-body font-medium
            bg-accent text-shell hover:bg-accent-dark
            transition-colors duration-150
          "
        >
          Retry
        </button>
      )}
      {variant === 'no-station' && (
        <p className="text-muted text-xs font-body text-center px-10">
          Search or select from the list on the left to get started
        </p>
      )}
    </div>
  );
}
