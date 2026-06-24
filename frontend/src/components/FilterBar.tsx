import React, { useMemo } from 'react';
import { useAppContext } from '../context/AppContext';

export function FilterBar(): React.JSX.Element {
  const { state, dispatch } = useAppContext();
  const { hotspots, minCisScore, selectedViolationTypes, aiRiskOnly } = state;

  const availableViolationTypes = useMemo(() => {
    const types = new Set<string>();
    for (const h of hotspots) {
      for (const dom of h.dominant_violation_types) {
        types.add(dom.type);
      }
    }
    return Array.from(types).sort();
  }, [hotspots]);

  if (hotspots.length === 0) return <></>;

  const activeFiltersCount = selectedViolationTypes.length + (minCisScore > 0 ? 1 : 0) + (aiRiskOnly ? 1 : 0);

  return (
    <div className="flex flex-col gap-4 px-4 py-4 border-b border-border bg-surface">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#55556A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
          </svg>
          <span className="text-xs font-semibold text-secondary-text uppercase tracking-wider">
            Filters
          </span>
          {activeFiltersCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-accent/20 text-accent text-2xs font-semibold leading-none">
              {activeFiltersCount}
            </span>
          )}
        </div>
        {activeFiltersCount > 0 && (
          <button
            onClick={() => dispatch({ type: 'CLEAR_FILTERS' })}
            className="text-2xs text-muted hover:text-secondary-text font-medium transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      {/* CIS Score Slider */}
      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <label htmlFor="cis-slider" className="text-xs text-secondary-text font-medium">
            Min CIS Score
          </label>
          <span className={`text-xs font-semibold font-mono ${minCisScore >= 75 ? 'text-critical' : minCisScore >= 50 ? 'text-high' : minCisScore >= 25 ? 'text-moderate' : 'text-muted'}`}>
            {minCisScore}
          </span>
        </div>
        <div className="relative">
          <input
            id="cis-slider"
            type="range"
            min="0"
            max="100"
            step="5"
            value={minCisScore}
            onChange={(e) => dispatch({ type: 'SET_MIN_CIS', payload: Number(e.target.value) })}
            className="w-full"
            style={{
              background: `linear-gradient(to right, #F5A623 0%, #F5A623 ${minCisScore}%, #2A2A35 ${minCisScore}%, #2A2A35 100%)`
            }}
          />
        </div>
        <div className="flex justify-between text-2xs text-muted">
          <span>Low</span>
          <span>Critical</span>
        </div>
      </div>

      {/* Violation Type Filter */}
      {availableViolationTypes.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-xs text-secondary-text font-medium">Violation Types</span>
          <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
            {availableViolationTypes.map((type) => {
              const isSelected = selectedViolationTypes.includes(type);
              return (
                <button
                  key={type}
                  onClick={() => dispatch({ type: 'TOGGLE_VIOLATION_TYPE', payload: type })}
                  className={`
                    px-2.5 py-1 text-2xs font-medium rounded-full border transition-all duration-150
                    ${isSelected
                      ? 'bg-accent/15 border-accent/40 text-accent'
                      : 'bg-surface-2 border-border text-muted hover:text-secondary-text hover:border-border-light'}
                  `}
                >
                  {type}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* AI Risk Toggle */}
      <div
        onClick={() => dispatch({ type: 'TOGGLE_AI_RISK_ONLY' })}
        className={`
          flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-all duration-200
          ${aiRiskOnly
            ? 'bg-critical-bg border-critical/30 text-danger-light'
            : 'bg-surface-2 border-border text-muted hover:border-border-light hover:text-secondary-text'}
        `}
      >
        {/* Custom toggle switch */}
        <div className={`
          relative w-9 h-5 rounded-full transition-colors duration-200 flex-none
          ${aiRiskOnly ? 'bg-danger' : 'bg-border'}
        `}>
          <div className={`
            absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200
            ${aiRiskOnly ? 'translate-x-4' : 'translate-x-0.5'}
          `}/>
        </div>
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-xs font-semibold leading-none">⚡ AI-flagged risks only</span>
          <span className="text-2xs text-muted leading-none">Show anomalous hotspots</span>
        </div>
      </div>
    </div>
  );
}
