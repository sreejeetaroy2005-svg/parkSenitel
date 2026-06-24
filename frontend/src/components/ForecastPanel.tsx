import React, { useEffect, useState, useCallback } from 'react';
import { useAppContext } from '../context/AppContext';
import { fetchForecast } from '../api/client';

interface ForecastItem {
  h3_index: string;
  station: string;
  predicted_risk: string; // e.g., 'NORMAL', 'MODERATE', 'HIGH', 'CRITICAL'
  confidence: number; // 0-1
  predicted_cis: number;
  time_horizon: string;
  // optionally include hotspot fields for display consistency
  latitude?: number;
  longitude?: number;
  sample_address?: string | null;
  peak_hour_label?: string;
  est_delay_minutes?: number;
  violation_count?: number;
  dominant_violation_types?: { type: string; count: number }[];
}

/** Simple row for a forecast entry */
function ForecastRow({ rank, item }: { rank: number; item: ForecastItem }) {
  const address = item.sample_address ??
    (item.latitude !== undefined && item.longitude !== undefined
      ? `${item.latitude.toFixed(4)}, ${item.longitude.toFixed(4)}`
      : item.station);
  const riskColor = (() => {
    switch (item.predicted_risk) {
      case 'CRITICAL': return '#C0392B';
      case 'HIGH': return '#E74C3C';
      case 'MODERATE': return '#F5A623';
      default: return '#27AE60'; // NORMAL or unknown
    }
  })();

  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border last:border-b-0 animate-fade-in">
      <div
        className="flex-none w-6 h-6 rounded flex items-center justify-center text-2xs font-display font-bold shrink-0"
        style={{ background: riskColor, color: '#FFF' }}
      >
        {rank}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-mono text-xs text-primary-text truncate" title={address}>
          {address}
        </p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1">
          <span className="font-mono text-2xs text-accent uppercase">{item.predicted_risk}</span>
          <span className="text-muted text-2xs">|</span>
          <span className="font-mono text-2xs text-secondary-text">
            Confidence: {(item.confidence * 100).toFixed(0)}%
          </span>
          <span className="text-muted text-2xs">|</span>
          <span className="font-mono text-2xs text-secondary-text">
            CIS: {item.predicted_cis.toFixed(0)}
          </span>
          <span className="text-muted text-2xs">|</span>
          <span className="font-mono text-2xs text-secondary-text">
            Horizon: {item.time_horizon}
          </span>
        </div>
      </div>
      <div className="flex-none w-12 flex flex-col items-end gap-0.5">
        <span className="font-display text-base font-bold leading-none" style={{ color: riskColor }}>
          {item.predicted_risk}
        </span>
        <div className="h-1 w-full rounded-full bg-border overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{ width: `${item.confidence * 100}%`, background: riskColor }}
          ></div>
        </div>
      </div>
    </div>
  );
}

/** Plain‑text version for copy */
function buildPlainText(stationName: string, items: ForecastItem[]): string {
  const lines: string[] = [`FORECAST — ${stationName}`, `Generated: ${new Date().toLocaleString()}`, '', ''];
  items.forEach((it, i) => {
    lines.push(`#${i + 1} — ${it.station}`);
    lines.push(`    Risk: ${it.predicted_risk} | Confidence: ${(it.confidence * 100).toFixed(0)}% | CIS: ${it.predicted_cis.toFixed(0)} | Horizon: ${it.time_horizon}`);
  });
  return lines.join('\n');
}

export function ForecastPanel(): React.JSX.Element | null {
  const { state, dispatch } = useAppContext();
  const { isForecastOpen, selectedStation } = state;
  const [forecasts, setForecasts] = useState<ForecastItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!selectedStation) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchForecast(10);
      setForecasts(data as ForecastItem[]);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load forecast');
    } finally {
      setLoading(false);
    }
  }, [selectedStation]);

  useEffect(() => {
    if (isForecastOpen) {
      load();
    }
  }, [isForecastOpen, load]);

  const handleCopy = useCallback(() => {
    if (!selectedStation) return;
    const text = buildPlainText(selectedStation.name, forecasts);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [selectedStation, forecasts]);

  const close = () => dispatch({ type: 'TOGGLE_FORECAST' });

  if (!isForecastOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-20 bg-shell/50 backdrop-blur-sm" onClick={close} aria-hidden="true" />
      {/* Panel */}
      <aside
        className="fixed top-0 right-0 h-screen w-80 bg-surface border-l border-border flex flex-col overflow-y-auto shadow-panel animate-slide-right"
        style={{ zIndex: 900 }}
        aria-label="Forecast panel"
        role="complementary"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-3 border-b border-border" style={{ background: 'rgba(245,166,35,0.07)' }}>
          <div className="flex-1 min-w-0">
            <p className="text-2xs font-body text-accent uppercase tracking-widest mb-0.5">📈 Forecast</p>
            <h2 className="font-display text-base font-semibold text-primary-text leading-tight truncate">
              {selectedStation?.name ?? 'No station'}
            </h2>
            <p className="text-2xs font-mono text-muted mt-0.5">{new Date().toLocaleString()}</p>
          </div>
          <button
            id="forecast-close"
            onClick={close}
            aria-label="Close forecast panel"
            className="flex-none mt-0.5 p-1.5 rounded text-muted hover:text-primary-text hover:bg-surface-2 transition-colors duration-150"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        {/* Body */}
        <div className="flex-1 px-4 py-2">
          {loading && <p className="text-center py-4">Loading forecast…</p>}
          {error && <p className="text-center py-4 text-danger">{error}</p>}
          {!loading && !error && forecasts.length === 0 && (
            <p className="text-center py-4 text-muted italic">No forecast data available.</p>
          )}
          {!loading && !error && forecasts.map((f, i) => (
            <ForecastRow key={f.h3_index} rank={i + 1} item={f} />
          ))}
        </div>
        {/* Footer */}
        <div className="px-4 py-3 border-t border-border">
          <button
            id="forecast-copy"
            onClick={handleCopy}
            disabled={forecasts.length === 0}
            className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded text-sm font-body font-medium border transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: copied ? 'rgba(245,166,35,0.15)' : 'rgba(245,166,35,0.08)',
              borderColor: '#F5A623',
              color: '#F5A623',
            }}
          >
            {copied ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
                Copy as text
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  );
}
