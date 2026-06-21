import React, { useMemo } from 'react';
import { AppProvider, useAppContext } from './context/AppContext';
import { useStations } from './hooks/useStations';
import { useHotspots } from './hooks/useHotspots';
import { StationSearch } from './components/StationSearch';
import { HotspotMap } from './components/HotspotMap';
import { HotspotTable } from './components/HotspotTable';
import { HotspotDetailPanel } from './components/HotspotDetailPanel';
import { ViewToggle } from './components/ViewToggle';
import { LoadingSpinner } from './components/LoadingSpinner';
import { EmptyState } from './components/EmptyState';
import { FilterBar } from './components/FilterBar';
import { SidebarCharts } from './components/SidebarCharts';

// ---------------------------------------------------------------------------
// Inner app — lives inside AppProvider so it can consume context
// ---------------------------------------------------------------------------
function AppInner(): React.JSX.Element {
  const { state, dispatch } = useAppContext();
  const { selectedStation, selectedHotspot, viewMode, hotspots, minCisScore, selectedViolationTypes, aiRiskOnly } = state;

  const { stations, loading: stationsLoading, error: stationsError, retry: retryStations } =
    useStations();

  const { loading: hotspotsLoading, error: hotspotsError, retry: retryHotspots } =
    useHotspots();

  const setViewMode = (mode: typeof viewMode) =>
    dispatch({ type: 'SET_VIEW_MODE', payload: mode });

  const filteredHotspots = useMemo(() => {
    return hotspots.filter((h) => {
      if (h.cis_normalized < minCisScore) return false;
      if (selectedViolationTypes.length > 0) {
        const hasSelectedType = h.dominant_violation_types.some((dom) =>
          selectedViolationTypes.includes(dom.type)
        );
        if (!hasSelectedType) return false;
      }
      if (aiRiskOnly && !h.ai_risk_flag) return false;
      return true;
    });
  }, [hotspots, minCisScore, selectedViolationTypes, aiRiskOnly]);

  // Decide what to show in the main content area
  const showLoading = hotspotsLoading;
  const showError = !!hotspotsError && !hotspotsLoading;
  const showEmpty = !selectedStation && !hotspotsLoading;
  const showNoResults = selectedStation && !hotspotsLoading && !hotspotsError && hotspots.length === 0;
  const showContent = selectedStation && !hotspotsLoading && !hotspotsError && hotspots.length > 0;

  return (
    <div className="flex h-full w-full overflow-hidden bg-shell">

      {/* ================================================================
          LEFT SIDEBAR
          ================================================================ */}
      <aside
        className="
          flex-none w-72 h-full
          bg-surface border-r border-border
          flex flex-col overflow-hidden
          animate-slide-left
        "
        aria-label="Station selector and summary"
      >
        {/* Wordmark / brand header */}
        <div className="px-4 pt-5 pb-4 border-b border-border">
          <div className="flex items-center gap-2 mb-1">
            {/* Road icon */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
              stroke="#F5A623" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              aria-hidden="true">
              <path d="M3 12h18M3 6h18M3 18h18"/>
              <rect x="9" y="9" width="6" height="6" rx="1" fill="#F5A623" fillOpacity="0.15" stroke="#F5A623"/>
            </svg>
            <h1 className="font-display text-xl font-bold text-primary-text tracking-wide leading-none">
              ParkSentinel
            </h1>
          </div>
          <p className="text-2xs text-muted font-body mt-0.5">
            AI Parking Enforcement Intelligence
          </p>
        </div>

        {/* Search */}
        <div className="px-4 py-4 border-b border-border">
          <StationSearch
            stations={stations}
            loading={stationsLoading}
            error={stationsError}
            onRetry={retryStations}
          />
        </div>

        {/* Filters */}
        <FilterBar />

        {/* Station stats strip (shown when a station is selected) */}
        {selectedStation && !hotspotsLoading && hotspots.length > 0 && (
          <div className="px-4 py-3 border-b border-border animate-fade-in">
            <p className="text-2xs text-muted font-body uppercase tracking-widest mb-3">
              {selectedStation.name}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-surface-2 rounded p-2.5 border border-border">
                <p className="text-2xs text-muted font-body mb-1">Hotspots</p>
                <p className="font-display text-lg font-bold text-primary-text">
                  {filteredHotspots.length}
                </p>
              </div>
              <div className="bg-surface-2 rounded p-2.5 border border-border">
                <p className="text-2xs text-muted font-body mb-1">Total Violations</p>
                <p className="font-display text-lg font-bold text-primary-text">
                  {filteredHotspots.reduce((s, h) => s + h.violation_count, 0).toLocaleString()}
                </p>
              </div>
              <div className="bg-surface-2 rounded p-2.5 border border-border">
                <p className="text-2xs text-muted font-body mb-1">Critical (CIS ≥ 75)</p>
                <p className="font-display text-lg font-bold text-danger-light">
                  {filteredHotspots.filter((h) => h.cis_normalized >= 75).length}
                </p>
              </div>
              <div className="bg-surface-2 rounded p-2.5 border border-border">
                <p className="text-2xs text-muted font-body mb-1">Avg CIS</p>
                <p className="font-display text-lg font-bold text-accent">
                  {filteredHotspots.length > 0 ? (filteredHotspots.reduce((s, h) => s + h.cis_normalized, 0) / filteredHotspots.length).toFixed(0) : '0'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Analytics Charts */}
        {selectedStation && !hotspotsLoading && hotspots.length > 0 && (
          <SidebarCharts />
        )}

        {/* Station list quick-select (visible when no station selected) */}
        {!selectedStation && !stationsLoading && !stationsError && stations.length > 0 && (
          <div className="flex-1 overflow-y-auto">
            <p className="px-4 py-3 text-2xs text-muted font-body uppercase tracking-widest border-b border-border">
              All Stations ({stations.length})
            </p>
            {stations.map((station) => (
              <button
                key={station.name}
                id={`station-list-${station.name.replace(/\s+/g, '-').toLowerCase()}`}
                onClick={() => dispatch({ type: 'SELECT_STATION', payload: station })}
                className="
                  w-full text-left px-4 py-2.5 text-sm font-body text-secondary-text
                  hover:bg-surface-2 hover:text-primary-text border-b border-border/50
                  transition-colors duration-75
                "
              >
                {station.name}
              </button>
            ))}
          </div>
        )}

        {/* Loading state in sidebar */}
        {stationsLoading && (
          <div className="flex-1 flex items-center justify-center">
            <LoadingSpinner size="sm" label="Loading stations…" />
          </div>
        )}

        {/* Bottom branding */}
        <div className="px-4 py-3 border-t border-border mt-auto">
          <p className="text-2xs text-muted font-body">
            Road Safety Hackathon · 2026
          </p>
        </div>
      </aside>

      {/* ================================================================
          MAIN CONTENT AREA
          ================================================================ */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top bar */}
        <div className="
          flex-none flex items-center justify-between gap-4
          px-4 py-2.5 border-b border-border bg-surface
        ">
          <div className="flex items-center gap-3 min-w-0">
            {selectedStation ? (
              <>
                <span className="font-display text-base font-semibold text-primary-text truncate">
                  {selectedStation.name}
                </span>
                {showContent && (
                  <span className="text-xs text-muted font-body hidden sm:block">
                    {filteredHotspots.length} hotspot{filteredHotspots.length !== 1 ? 's' : ''}
                  </span>
                )}
              </>
            ) : (
              <span className="text-sm text-muted font-body">No station selected</span>
            )}
          </div>

          <div className="flex-none">
            <ViewToggle value={viewMode} onChange={setViewMode} />
          </div>
        </div>

        {/* Content area — map or table */}
        <div className="flex-1 relative overflow-hidden">

          {/* Loading overlay */}
          {showLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-shell/80 z-20 animate-fade-in">
              <LoadingSpinner size="lg" label="Loading hotspots…" />
            </div>
          )}

          {/* Error state */}
          {showError && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <EmptyState
                variant="error"
                message={hotspotsError ?? 'Failed to load hotspots'}
                onRetry={retryHotspots}
              />
            </div>
          )}

          {/* No station selected */}
          {showEmpty && (
            <EmptyState variant="no-station" />
          )}

          {/* Station selected but no hotspots */}
          {showNoResults && (
            <EmptyState variant="no-hotspots" message={`No hotspots found for ${selectedStation?.name}`} />
          )}

          {/* Map view */}
          {(showContent || (selectedStation && hotspotsLoading)) && viewMode === 'map' && (
            <div className="absolute inset-0">
              <HotspotMap hotspots={filteredHotspots} />
            </div>
          )}

          {/* List view */}
          {showContent && viewMode === 'list' && (
            <div className="absolute inset-0 bg-surface animate-fade-in">
              <HotspotTable hotspots={filteredHotspots} />
            </div>
          )}

          {/* Detail panel overlay (map mode only) */}
          {selectedHotspot && viewMode === 'map' && (
            <div className="absolute right-0 top-0 h-full z-10 pointer-events-none">
              <div className="pointer-events-auto h-full">
                <HotspotDetailPanel hotspot={selectedHotspot} />
              </div>
            </div>
          )}

          {/* Detail panel inline (list mode) */}
          {selectedHotspot && viewMode === 'list' && (
            <div className="absolute right-0 top-0 h-full z-20 pointer-events-none">
              <div className="pointer-events-auto h-full">
                <HotspotDetailPanel hotspot={selectedHotspot} />
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root export — wrap with AppProvider
// ---------------------------------------------------------------------------
export default function App(): React.JSX.Element {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  );
}
