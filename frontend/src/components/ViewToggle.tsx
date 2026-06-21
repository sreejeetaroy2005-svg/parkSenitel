import React from 'react';
import type { ViewMode } from '../types/index';

interface ViewToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

/**
 * Pill toggle that switches between Map and List view.
 * Active tab gets the amber fill; inactive is ghost text on dark surface.
 */
export function ViewToggle({ value, onChange }: ViewToggleProps): React.JSX.Element {
  return (
    <div
      role="tablist"
      aria-label="View mode"
      className="flex items-center bg-surface-2 rounded p-0.5 gap-0.5 border border-border"
    >
      <button
        id="view-toggle-map"
        role="tab"
        aria-selected={value === 'map'}
        onClick={() => onChange('map')}
        className={`
          flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-body font-medium
          transition-all duration-150
          ${value === 'map'
            ? 'bg-accent text-shell shadow-sm'
            : 'text-secondary-text hover:text-primary-text'
          }
        `}
      >
        {/* Map icon */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          aria-hidden="true">
          <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
          <line x1="8" y1="2" x2="8" y2="18"/>
          <line x1="16" y1="6" x2="16" y2="22"/>
        </svg>
        Map
      </button>

      <button
        id="view-toggle-list"
        role="tab"
        aria-selected={value === 'list'}
        onClick={() => onChange('list')}
        className={`
          flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-body font-medium
          transition-all duration-150
          ${value === 'list'
            ? 'bg-accent text-shell shadow-sm'
            : 'text-secondary-text hover:text-primary-text'
          }
        `}
      >
        {/* List icon */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          aria-hidden="true">
          <line x1="8" y1="6" x2="21" y2="6"/>
          <line x1="8" y1="12" x2="21" y2="12"/>
          <line x1="8" y1="18" x2="21" y2="18"/>
          <line x1="3" y1="6" x2="3.01" y2="6"/>
          <line x1="3" y1="12" x2="3.01" y2="12"/>
          <line x1="3" y1="18" x2="3.01" y2="18"/>
        </svg>
        List
      </button>
    </div>
  );
}
