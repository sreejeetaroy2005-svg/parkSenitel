import React, { useMemo } from 'react';
import { AppProvider, useAppContext } from './context/AppContext';
import { useStations } from './hooks/useStations';
import { useHotspots } from './hooks/useHotspots';
import { StationSearch } from './components/StationSearch';
import { HotspotMap } from './components/HotspotMap';
import { HotspotTable } from './components/HotspotTable';
import { HotspotDetailPanel } from './components/HotspotDetailPanel';
import { ShiftBriefing } from './components/ShiftBriefing';
import { ForecastPanel } from './components/ForecastPanel';
import { ViewToggle } from './components/ViewToggle';
import { LoadingSpinner } from './components/LoadingSpinner';
import { EmptyState } from './components/EmptyState';
import { FilterBar } from './components/FilterBar';
import { SidebarCharts } from './components/SidebarCharts';

// ---------------------------------------------------------------------------
// KPI Card component
// ---------------------------------------------------------------------------
interface KpiCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  colorClass: string;   // e.g. 'card-glow-red'
  iconColor: string;
  icon: React.ReactNode;
}

function KpiCard({ label, value, subtext, colorClass, iconColor, icon }: KpiCardProps): React.JSX.Element {
  return (
    <div className={`
      flex-1 rounded-xl bg-surface-2 border border-border p-4
      ${colorClass}
      transition-all duration-200 hover:scale-[1.01] cursor-default
      animate-slide-up
    `}>
      <div className="flex items-start justify-between mb-3">
        <span className="text-2xs text-muted uppercase tracking-widest font-medium">{label}</span>
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: `${iconColor}18` }}
        >
          <span style={{ color: iconColor }}>{icon}</span>
        </div>
      </div>
      <p className="text-2xl font-bold text-primary-text leading-none font-mono mb-1 animate-count-up">
        {value}
      </p>
      {subtext && (
        <p className="text-2xs text-muted mt-1">{subtext}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inner app — lives inside AppProvider so it can consume context
// ---------------------------------------------------------------------------
function AppInner(): React.JSX.Element {
  const { state, dispatch } = useAppContext();
  const {
    selectedStation,
    selectedHotspot,
    isShiftBriefingOpen,
    viewMode,
    hotspots,
    minCisScore,
    selectedViolationTypes,
    aiRiskOnly,
  } = state;

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

  // KPI calculations
  const totalViolations = filteredHotspots.reduce((s, h) => s + h.violation_count, 0);
  const criticalCount   = filteredHotspots.filter((h) => h.cis_normalized >= 75).length;
  const aiRiskCount     = filteredHotspots.filter((h) => h.ai_risk_flag).length;
  const avgCis          = filteredHotspots.length > 0
    ? (filteredHotspots.reduce((s, h) => s + h.cis_normalized, 0) / filteredHotspots.length).toFixed(0)
    : '—';

  const showLoading    = hotspotsLoading;
  const showError      = !!hotspotsError && !hotspotsLoading;
  const showEmpty      = !selectedStation && !hotspotsLoading;
  const showNoResults  = selectedStation && !hotspotsLoading && !hotspotsError && hotspots.length === 0;
  const showContent    = selectedStation && !hotspotsLoading && !hotspotsError && hotspots.length > 0;

  return (
    <div className="flex min-h-screen w-full overflow-auto bg-shell">

      {/* ================================================================
          LEFT SIDEBAR
          ================================================================ */}
      <aside
        className="flex-none w-72 h-screen flex flex-col bg-surface border-r border-border animate-slide-left"
        aria-label="Station selector and summary"
        style={{ position: 'sticky', top: 0 }}
      >
        {/* Brand header */}
        <div className="px-4 pt-4 pb-3.5 border-b border-border">
          <div className="flex items-center gap-2.5 mb-1">
            {/* Shield icon */}
            <div className="w-7 h-7 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center flex-none">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="#F5A623" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                aria-hidden="true">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-bold text-primary-text tracking-tight leading-none">
                ParkSentinel
              </h1>
              <p className="text-2xs text-muted mt-0.5 leading-none">AI Enforcement Intelligence</p>
            </div>
          </div>

          {/* Action buttons */}
          {selectedStation && hotspots.length > 0 && (
            <div className="mt-3 flex items-center gap-2">
              <button
                id="shift-briefing-open"
                onClick={() => dispatch({ type: 'TOGGLE_SHIFT_BRIEFING' })}
                className={`
                  flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium
                  border transition-all duration-150
                  ${isShiftBriefingOpen
                    ? 'bg-accent/15 text-accent border-accent/30'
                    : 'border-border text-muted hover:text-secondary-text hover:border-border-light bg-surface-2'}
                `}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                  <polyline points="10 9 9 9 8 9"/>
                </svg>
                Briefing
              </button>
              <button
                id="forecast-open"
                onClick={() => dispatch({ type: 'TOGGLE_FORECAST' })}
                className={`
                  flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium
                  border transition-all duration-150
                  ${state.isForecastOpen
                    ? 'bg-accent/15 text-accent border-accent/30'
                    : 'border-border text-muted hover:text-secondary-text hover:border-border-light bg-surface-2'}
                `}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                </svg>
                Forecast
              </button>
            </div>
          )}
        </div>

        {/* Search */}
        <div className="px-4 py-3.5 border-b border-border">
          <StationSearch
            stations={stations}
            loading={stationsLoading}
            error={stationsError}
            onRetry={retryStations}
          />
        </div>

        {/* Filters */}
        <FilterBar />

        {/* Station stats when selected */}
        {selectedStation && !hotspotsLoading && hotspots.length > 0 && (
          <div className="px-4 py-3.5 border-b border-border animate-fade-in">
            <p className="text-2xs text-muted uppercase tracking-widest mb-3 font-medium">
              {selectedStation.name}
            </p>
            <div className="grid grid-cols-2 gap-3">
              {/* Hotspots Card */}
              <div className="bg-surface-2 rounded-xl p-3 border border-border hover:border-border-light transition-all shadow-sm group">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-muted font-medium">Hotspots</p>
                  <div className="w-6 h-6 rounded-md bg-surface-3 flex items-center justify-center text-secondary-text group-hover:text-primary-text transition-colors">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                  </div>
                </div>
                <div className="flex items-end gap-2">
                  <p className="text-2xl font-display font-bold text-primary-text leading-none">{filteredHotspots.length}</p>
                </div>
              </div>

              {/* Total Violations Card */}
              <div className="bg-surface-2 rounded-xl p-3 border border-border hover:border-border-light transition-all shadow-sm group">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-muted font-medium">Violations</p>
                  <div className="w-6 h-6 rounded-md bg-surface-3 flex items-center justify-center text-secondary-text group-hover:text-primary-text transition-colors">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                  </div>
                </div>
                <div className="flex items-end gap-2">
                  <p className="text-2xl font-display font-bold text-primary-text leading-none">{totalViolations.toLocaleString()}</p>
                </div>
              </div>

              {/* Critical Zones Card */}
              <div className="bg-gradient-to-b from-critical-bg to-surface-2 rounded-xl p-3 border border-critical/20 hover:border-critical/40 transition-all shadow-sm group relative overflow-hidden">
                <div className="absolute top-0 right-0 p-3 opacity-10 text-critical pointer-events-none">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                </div>
                <div className="flex items-center justify-between mb-2 relative z-10">
                  <p className="text-xs text-critical font-medium">Critical</p>
                  <div className="w-6 h-6 rounded-md bg-critical/10 flex items-center justify-center text-critical">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                  </div>
                </div>
                <div className="flex items-end gap-2 relative z-10">
                  <p className="text-2xl font-display font-bold text-critical leading-none">{criticalCount}</p>
                </div>
              </div>

              {/* Avg CIS Card */}
              <div className="bg-surface-2 rounded-xl p-3 border border-border hover:border-accent/30 transition-all shadow-sm group">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-muted font-medium">Avg CIS</p>
                  <div className="w-6 h-6 rounded-md bg-accent-glow flex items-center justify-center text-accent">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
                  </div>
                </div>
                <div className="flex items-end gap-2">
                  <p className="text-2xl font-display font-bold text-accent leading-none">{avgCis}</p>
                  <span className="text-xs text-muted mb-0.5">/ 100</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Analytics charts */}
        {selectedStation && !hotspotsLoading && hotspots.length > 0 && (
          <SidebarCharts />
        )}

        {/* Station list (no selection) */}
        {!selectedStation && !stationsLoading && !stationsError && stations.length > 0 && (
          <div className="flex-1 overflow-y-auto">
            <p className="px-4 py-2.5 text-2xs text-muted uppercase tracking-widest border-b border-border font-medium">
              All Stations ({stations.length})
            </p>
            {stations.map((station) => (
              <button
                key={station.name}
                id={`station-list-${station.name.replace(/\s+/g, '-').toLowerCase()}`}
                onClick={() => dispatch({ type: 'SELECT_STATION', payload: station })}
                className="
                  w-full text-left px-4 py-2.5 text-sm text-secondary-text
                  hover:bg-surface-2 hover:text-primary-text border-b border-border/40
                  transition-all duration-100 flex items-center justify-between group
                "
              >
                <span>{station.name}</span>
                <svg className="opacity-0 group-hover:opacity-40 transition-opacity" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
            ))}
          </div>
        )}

        {/* Sidebar loading */}
        {stationsLoading && (
          <div className="flex-1 flex items-center justify-center">
            <LoadingSpinner size="sm" label="Loading stations…" />
          </div>
        )}

        {/* Bottom bar */}
        <div className="mt-auto px-4 py-3 border-t border-border flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-normal animate-pulse-amber" />
          <p className="text-2xs text-muted">Road Safety Hackathon · 2026</p>
        </div>
      </aside>

      {/* ================================================================
          MAIN CONTENT AREA
          ================================================================ */}
      <main className="flex-1 flex flex-col min-w-0">

        {/* Top bar */}
        <div className="
          flex-none flex items-center justify-between gap-4
          px-5 py-3 border-b border-border bg-surface
          sticky top-0 z-30
        ">
          <div className="flex items-center gap-3 min-w-0">
            {selectedStation ? (
              <>
                <div className="w-2 h-2 rounded-full bg-normal animate-pulse" />
                <span className="font-semibold text-sm text-primary-text truncate">
                  {selectedStation.name}
                </span>
                {showContent && (
                  <span className="px-2 py-0.5 rounded-full bg-surface-2 border border-border text-2xs text-muted">
                    {filteredHotspots.length} hotspot{filteredHotspots.length !== 1 ? 's' : ''}
                  </span>
                )}
              </>
            ) : (
              <span className="text-sm text-muted">← Select a station to begin</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <ViewToggle value={viewMode} onChange={setViewMode} />
          </div>
        </div>

        {/* KPI Cards (shown when content is loaded) */}
        {showContent && (
          <div className="flex-none px-5 py-4 grid grid-cols-4 gap-3 border-b border-border bg-surface animate-fade-in">
            <KpiCard
              label="Total Violations"
              value={totalViolations.toLocaleString()}
              subtext={`Across ${filteredHotspots.length} hotspots`}
              colorClass="card-glow-amber"
              iconColor="#F5A623"
              icon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              }
            />
            <KpiCard
              label="Active Hotspots"
              value={filteredHotspots.length}
              subtext={`of ${hotspots.length} total`}
              colorClass="card-glow-orange"
              iconColor="#F97316"
              icon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              }
            />
            <KpiCard
              label="Critical Zones"
              value={criticalCount}
              subtext="CIS ≥ 75 — needs attention"
              colorClass="card-glow-red"
              iconColor="#EF4444"
              icon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              }
            />
            <KpiCard
              label="AI Risk Alerts"
              value={aiRiskCount}
              subtext="Emerging anomalies flagged"
              colorClass={aiRiskCount > 0 ? 'card-glow-red' : 'card-glow-green'}
              iconColor={aiRiskCount > 0 ? '#EF4444' : '#22C55E'}
              icon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                </svg>
              }
            />
          </div>
        )}

        {/* Content area */}
        <div className="flex-1 relative overflow-hidden">

          {/* Loading */}
          {showLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-shell/80 z-20 backdrop-blur-sm animate-fade-in-fast">
              <LoadingSpinner size="lg" label="Analyzing hotspots…" />
            </div>
          )}

          {/* Error */}
          {showError && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <EmptyState
                variant="error"
                message={hotspotsError ?? 'Failed to load hotspots'}
                onRetry={retryHotspots}
              />
            </div>
          )}

          {/* No station */}
          {showEmpty && <EmptyState variant="no-station" />}

          {/* No results */}
          {showNoResults && (
            <EmptyState
              variant="no-hotspots"
              message={`No hotspots found for ${selectedStation?.name}`}
            />
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

          {/* Detail panel — map mode */}
          {selectedHotspot && viewMode === 'map' && (
            <div className="absolute right-0 top-0 h-full w-[340px] z-[800] pointer-events-none">
              <div className="pointer-events-auto h-full">
                <HotspotDetailPanel hotspot={selectedHotspot} />
              </div>
            </div>
          )}

          {/* Detail panel — list mode */}
          {selectedHotspot && viewMode === 'list' && (
            <div className="absolute right-0 top-0 h-full z-20 pointer-events-none">
              <div className="pointer-events-auto h-full">
                <HotspotDetailPanel hotspot={selectedHotspot} />
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Shift Briefing */}
      <ShiftBriefing />

      {/* Forecast Panel */}
      <ForecastPanel />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root export
// ---------------------------------------------------------------------------
export default function App(): React.JSX.Element {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  );
}
