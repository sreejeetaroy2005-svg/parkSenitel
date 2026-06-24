import React from 'react';

interface EmptyStateProps {
  variant: 'no-station' | 'no-hotspots' | 'error';
  message?: string;
  onRetry?: () => void;
}

export function EmptyState({ variant, message, onRetry }: EmptyStateProps): React.JSX.Element {

  if (variant === 'no-station') {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full animate-fade-in px-8">
        {/* Decorative grid background */}
        <div className="relative mb-10">
          <div className="absolute inset-0 bg-gradient-radial from-accent/5 to-transparent rounded-full w-64 h-64 -translate-x-1/2 -translate-y-1/2 left-1/2 top-1/2 blur-3xl" />
          {/* Map pin icon */}
          <div className="relative w-20 h-20 rounded-2xl bg-surface-2 border border-border flex items-center justify-center shadow-card">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="rgba(245,166,35,0.1)"/>
              <circle cx="12" cy="9" r="2.5" fill="rgba(245,166,35,0.2)" stroke="#F5A623"/>
            </svg>
          </div>
        </div>

        <h2 className="text-xl font-semibold text-primary-text mb-2 tracking-tight">
          Select a Police Station
        </h2>
        <p className="text-secondary-text text-sm text-center leading-relaxed max-w-xs">
          Search for a station using the sidebar to view AI-analyzed parking hotspots on the map.
        </p>

        {/* Feature pills */}
        <div className="flex flex-wrap gap-2 mt-8 justify-center">
          {['AI Cluster Detection', 'Anomaly Flagging', 'CIS Scoring', 'Shift Briefings'].map((f) => (
            <span key={f} className="px-3 py-1.5 rounded-full bg-surface-2 border border-border text-2xs text-secondary-text font-medium">
              {f}
            </span>
          ))}
        </div>
      </div>
    );
  }

  if (variant === 'no-hotspots') {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full animate-fade-in px-8">
        <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-border flex items-center justify-center mb-6 shadow-card">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#55556A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            <line x1="8" y1="11" x2="14" y2="11"/>
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-primary-text mb-1.5 tracking-tight">No Hotspots Found</h2>
        <p className="text-muted text-sm text-center">{message ?? 'No hotspots match the current filters.'}</p>
      </div>
    );
  }

  // Error
  return (
    <div className="flex flex-col items-center justify-center h-full w-full animate-fade-in px-8">
      <div className="w-16 h-16 rounded-2xl bg-critical-bg border border-critical/20 flex items-center justify-center mb-6 shadow-card animate-pulse-red">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" fill="rgba(239,68,68,0.1)"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-danger-light mb-1.5 tracking-tight">Connection Error</h2>
      <p className="text-muted text-sm text-center max-w-xs leading-relaxed">{message ?? 'Failed to load data. Please check the backend server.'}</p>
      {onRetry && (
        <button
          id="empty-state-retry-btn"
          onClick={onRetry}
          className="mt-5 px-5 py-2 rounded-lg text-sm font-medium bg-surface-2 border border-border text-primary-text hover:border-accent/50 hover:text-accent transition-all duration-200 shadow-card"
        >
          Try Again
        </button>
      )}
    </div>
  );
}
