import React, { useMemo } from 'react';
import { useAppContext } from '../context/AppContext';

export function FilterBar(): React.JSX.Element {
  const { state, dispatch } = useAppContext();
  const { hotspots, minCisScore, selectedViolationTypes, aiRiskOnly } = state;

  // Extract all unique violation types from current hotspots
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
    <div className="flex flex-col gap-3 px-4 py-3 bg-surface-2 border-b border-border">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-primary-text uppercase tracking-wider">
          Filters {activeFiltersCount > 0 && `(${activeFiltersCount})`}
        </h3>
        {activeFiltersCount > 0 && (
          <button
            onClick={() => dispatch({ type: 'CLEAR_FILTERS' })}
            className="text-2xs text-accent hover:text-accent/80 font-medium"
          >
            Clear All
          </button>
        )}
      </div>

      {/* CIS Score Filter */}
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between items-center text-xs text-secondary-text">
          <label htmlFor="cis-slider" className="font-medium">Minimum CIS Score</label>
          <span>{minCisScore}</span>
        </div>
        <input
          id="cis-slider"
          type="range"
          min="0"
          max="100"
          step="5"
          value={minCisScore}
          onChange={(e) => dispatch({ type: 'SET_MIN_CIS', payload: Number(e.target.value) })}
          className="w-full accent-accent h-1.5 bg-border rounded-lg appearance-none cursor-pointer"
        />
      </div>

      {/* Violation Type Filter */}
      {availableViolationTypes.length > 0 && (
        <div className="flex flex-col gap-1.5 mt-1">
          <span className="text-xs font-medium text-secondary-text">Violation Types</span>
          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
            {availableViolationTypes.map((type) => {
              const isSelected = selectedViolationTypes.includes(type);
              return (
                <button
                  key={type}
                  onClick={() => dispatch({ type: 'TOGGLE_VIOLATION_TYPE', payload: type })}
                  className={`
                    px-2 py-1 text-2xs font-body rounded-full border transition-colors
                    ${isSelected 
                      ? 'bg-accent/20 border-accent/50 text-accent' 
                      : 'bg-surface border-border text-secondary-text hover:border-secondary-text/50'}
                  `}
                >
                  {type}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* AI Risk Filter */}
      <div className="flex items-center gap-2 mt-2 pt-3 border-t border-border">
        <input
          type="checkbox"
          id="ai-risk-filter"
          checked={aiRiskOnly}
          onChange={() => dispatch({ type: 'TOGGLE_AI_RISK_ONLY' })}
          className="w-4 h-4 rounded bg-surface border-border accent-danger-light focus:ring-danger/50"
        />
        <label htmlFor="ai-risk-filter" className="text-xs font-medium text-danger-light flex items-center gap-1 cursor-pointer">
          <span>⚡</span> AI-flagged emerging risk only
        </label>
      </div>
    </div>
  );
}
