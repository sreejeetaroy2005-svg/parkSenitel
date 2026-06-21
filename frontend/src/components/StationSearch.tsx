import React, { useState, useRef, useEffect, useCallback, useId } from 'react';
import type { Station } from '../types/index';
import { filterStations } from '../utils/formatters';
import { useAppContext } from '../context/AppContext';

interface StationSearchProps {
  stations: Station[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

/**
 * Combobox-style station picker:
 *  - Free-text filtering (case-insensitive substring)
 *  - Keyboard navigation: ↑ / ↓ move highlight, Enter selects, Escape closes
 *  - Click-outside closes dropdown
 *  - Amber focus ring, dark surface dropdown
 */
export function StationSearch({
  stations,
  loading,
  error,
  onRetry,
}: StationSearchProps): React.JSX.Element {
  const { state, dispatch } = useAppContext();
  const { selectedStation } = state;

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const filtered = filterStations(stations, query);

  // Close on click-outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlighted >= 0 && listRef.current) {
      const item = listRef.current.children[highlighted] as HTMLElement | undefined;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlighted]);

  const select = useCallback(
    (station: Station) => {
      dispatch({ type: 'SELECT_STATION', payload: station });
      setQuery('');
      setOpen(false);
      setHighlighted(-1);
    },
    [dispatch]
  );

  const clear = useCallback(() => {
    dispatch({ type: 'SELECT_STATION', payload: null });
    setQuery('');
    inputRef.current?.focus();
  }, [dispatch]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') setOpen(true);
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlighted((h) => Math.max(h - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlighted >= 0 && filtered[highlighted]) {
          select(filtered[highlighted]);
        }
        break;
      case 'Escape':
        setOpen(false);
        setHighlighted(-1);
        break;
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Label */}
      <label
        htmlFor="station-search-input"
        className="block text-2xs font-body font-medium text-muted uppercase tracking-widest mb-1.5"
      >
        Police Station
      </label>

      {/* Input row */}
      <div className="relative flex items-center">
        {/* Search icon */}
        <svg
          className="absolute left-3 text-muted pointer-events-none"
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>

        <input
          id="station-search-input"
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-activedescendant={highlighted >= 0 ? `station-option-${highlighted}` : undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder={loading ? 'Loading stations…' : 'Search station…'}
          disabled={loading || !!error}
          value={selectedStation && !query ? selectedStation.name : query}
          onFocus={() => { setOpen(true); setQuery(''); }}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setHighlighted(-1); }}
          onKeyDown={handleKeyDown}
          className="
            w-full pl-9 pr-8 py-2.5 rounded bg-surface-2 border border-border
            text-primary-text text-sm font-body placeholder:text-muted
            focus:outline-none focus:border-accent focus:shadow-amber
            transition-all duration-150
            disabled:opacity-40 disabled:cursor-not-allowed
          "
        />

        {/* Clear or chevron */}
        {selectedStation ? (
          <button
            id="station-search-clear"
            onClick={clear}
            aria-label="Clear station selection"
            className="absolute right-2.5 text-muted hover:text-primary-text transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        ) : (
          <svg
            className="absolute right-2.5 text-muted pointer-events-none"
            width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            aria-hidden="true">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="mt-1.5 flex items-center gap-2 text-xs text-danger-light font-body">
          <span>Failed to load stations.</span>
          <button
            id="station-search-retry"
            onClick={onRetry}
            className="underline text-accent hover:text-accent-dark"
          >
            Retry
          </button>
        </div>
      )}

      {/* Dropdown */}
      {open && !loading && !error && filtered.length > 0 && (
        <ul
          id={listboxId}
          ref={listRef}
          role="listbox"
          aria-label="Police stations"
          className="
            absolute z-50 top-full mt-1 w-full max-h-72 overflow-y-auto
            bg-surface-2 border border-border rounded shadow-panel
            animate-fade-in
          "
        >
          {filtered.map((station, idx) => (
            <li
              key={station.name}
              id={`station-option-${idx}`}
              role="option"
              aria-selected={selectedStation?.name === station.name}
              onMouseDown={() => select(station)}
              onMouseEnter={() => setHighlighted(idx)}
              className={`
                flex items-center justify-between px-3 py-2.5 cursor-pointer
                text-sm font-body transition-colors duration-75
                ${idx === highlighted ? 'bg-accent text-shell' : ''}
                ${selectedStation?.name === station.name && idx !== highlighted
                  ? 'text-accent'
                  : idx !== highlighted ? 'text-primary-text hover:bg-surface' : ''}
              `}
            >
              <span>{station.name}</span>
              {selectedStation?.name === station.name && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                  aria-hidden="true">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* No results */}
      {open && !loading && !error && filtered.length === 0 && query.trim() !== '' && (
        <div className="
          absolute z-50 top-full mt-1 w-full
          bg-surface-2 border border-border rounded shadow-panel
          px-3 py-4 text-center text-sm text-muted font-body animate-fade-in
        ">
          No stations match &quot;{query}&quot;
        </div>
      )}
    </div>
  );
}
