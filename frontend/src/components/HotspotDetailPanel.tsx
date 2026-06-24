import React from 'react';
import type { Hotspot } from '../types/index';
import { formatAddress, formatCisExplanation } from '../utils/formatters';
import { cisToColor } from '../utils/colors';
import { useAppContext } from '../context/AppContext';

interface HotspotDetailPanelProps {
  hotspot: Hotspot;
}

function CisContributorBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-2xs text-secondary-text">{label}</span>
          <span className="text-2xs font-mono font-semibold" style={{ color }}>+{value}</span>
        </div>
        <div className="h-1 rounded-full bg-border overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${Math.min(value, 100)}%`, background: color }}
          />
        </div>
      </div>
    </div>
  );
}

function violationBadgeStyle(type: string): string {
  const t = type.toUpperCase();
  if (t.includes('OBSTRUCTION') || t.includes('BLOCKING')) return 'bg-critical-bg text-danger-light border-critical/20';
  if (t.includes('MAIN ROAD') || t.includes('DOUBLE') || t.includes('CROSSING')) return 'bg-high-bg text-high border-high/20';
  return 'bg-surface-2 text-secondary-text border-border';
}

export function HotspotDetailPanel({ hotspot }: HotspotDetailPanelProps): React.JSX.Element {
  const { dispatch } = useAppContext();
  const close = () => dispatch({ type: 'SELECT_HOTSPOT', payload: null });

  const cisColor = cisToColor(hotspot.cis_normalized);
  const cisLabel = hotspot.cis_normalized >= 75
    ? 'Critical' : hotspot.cis_normalized >= 50
    ? 'High' : hotspot.cis_normalized >= 25
    ? 'Moderate' : 'Low';

  const cisBgClass = hotspot.cis_normalized >= 75
    ? 'bg-critical-bg border-critical/20'
    : hotspot.cis_normalized >= 50
    ? 'bg-high-bg border-high/20'
    : 'bg-surface-2 border-border';

  // Estimated contributor breakdown for AI Insight panel
  const severityContrib = Math.round(hotspot.cis_normalized * 0.30);
  const junctionContrib = hotspot.junction_flag ? Math.round(hotspot.cis_normalized * 0.20) : 0;
  const peakContrib = Math.round(hotspot.cis_normalized * 0.22);
  const volumeContrib = Math.round(hotspot.cis_normalized * 0.18);

  // Google Maps link
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${hotspot.latitude},${hotspot.longitude}`;

  return (
    <aside
      className="
        animate-slide-right
        absolute right-0 top-0 h-full w-[340px]
        bg-surface border-l border-border
        flex flex-col overflow-hidden
        shadow-panel z-10
      "
      aria-label="Hotspot detail"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-3 border-b border-border bg-surface-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xs font-mono text-muted">HOTSPOT DETAIL</span>
            <span
              className="px-1.5 py-0.5 rounded text-2xs font-semibold"
              style={{ background: `${cisColor}20`, color: cisColor }}
            >
              {cisLabel}
            </span>
          </div>
          <h2
            className="font-semibold text-sm text-primary-text leading-snug"
            title={formatAddress(hotspot)}
          >
            {formatAddress(hotspot)}
          </h2>
        </div>
        <button
          id="hotspot-panel-close"
          onClick={close}
          aria-label="Close hotspot detail"
          className="flex-none mt-0.5 p-1.5 rounded-md text-muted hover:text-primary-text hover:bg-surface-3 transition-all duration-150"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* CIS Score card */}
        <div className={`rounded-2xl border p-5 relative overflow-hidden shadow-sm ${cisBgClass}`}>
          <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-20 blur-2xl pointer-events-none" style={{ background: cisColor }}></div>
          <div className="flex items-end justify-between mb-4 relative z-10">
            <div>
              <p className="text-xs text-muted font-medium mb-1">Congestion Impact Score</p>
              <div className="flex items-baseline gap-2">
                <p className="text-5xl font-display font-bold leading-none tracking-tight" style={{ color: cisColor }}>
                  {hotspot.cis_normalized.toFixed(0)}
                </p>
                <span className="text-sm font-semibold" style={{ color: cisColor }}>/ 100</span>
              </div>
            </div>
            <div className="text-right">
              <span className={`px-2 py-1 rounded-md text-xs font-semibold inline-block`} style={{ background: `${cisColor}20`, color: cisColor }}>
                {cisLabel}
              </span>
            </div>
          </div>
          <div className="h-2 rounded-full bg-black/20 overflow-hidden relative z-10 shadow-inner">
            <div
              className="h-full rounded-full transition-all duration-1000 ease-out"
              style={{ width: `${hotspot.cis_normalized}%`, background: `linear-gradient(90deg, ${cisColor}88, ${cisColor})`, boxShadow: `0 0 10px ${cisColor}88` }}
            />
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-surface-2 border border-border p-4 hover:border-border-light transition-colors shadow-sm flex flex-col justify-center">
            <p className="text-xs text-muted font-medium mb-1 flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
              Violations
            </p>
            <p className="font-display font-bold text-2xl text-primary-text leading-none">
              {hotspot.violation_count.toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl bg-surface-2 border border-border p-4 hover:border-border-light transition-colors shadow-sm flex flex-col justify-center">
            <p className="text-xs text-muted font-medium mb-1 flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
              Peak Hour
            </p>
            <p className="font-display font-bold text-lg text-accent leading-tight">
              {hotspot.peak_hour_label.replace(' IST', '')}
            </p>
          </div>
        </div>

        {/* Delay impact */}
        {(hotspot.est_delay_minutes ?? null) !== null && (
          <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-accent/8 border border-accent/20">
            <div className="flex items-center gap-2">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              <span className="text-xs font-medium text-accent">Est. delay impact</span>
            </div>
            <span className="font-mono text-sm font-bold text-accent">
              {(hotspot.est_delay_minutes ?? 0).toLocaleString()} veh-min/day
            </span>
          </div>
        )}

        {/* Junction flag */}
        {hotspot.junction_flag && (
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-high-bg border border-high/20">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#F97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span className="text-xs text-high font-medium">Junction proximity — CIS boosted ×1.3</span>
          </div>
        )}

        {/* AI Insights Card */}
        <div className="rounded-xl bg-surface-2 border border-border overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-border/50 bg-gradient-to-r from-surface-3 to-surface-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-primary-text/10 flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EEEEF5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
                </svg>
              </div>
              <span className="text-xs font-semibold text-primary-text tracking-wide">AI Engine Insights</span>
            </div>
          </div>
          <div className="p-4 flex flex-col gap-3">
            {/* DBSCAN */}
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center border ${hotspot.ai_cluster_validated ? 'bg-normal-bg border-normal/30 text-normal' : 'bg-surface border-border text-muted'}`}>
                {hotspot.ai_cluster_validated ? (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                ) : (
                  <span className="text-[10px]">•</span>
                )}
              </div>
              <div>
                <p className={`text-xs font-semibold ${hotspot.ai_cluster_validated ? 'text-primary-text' : 'text-muted'}`}>
                  {hotspot.ai_cluster_validated ? 'Density Cluster Verified' : 'Not Density Verified'}
                </p>
                <p className="text-xs text-muted mt-0.5">
                  {hotspot.ai_cluster_validated ? 'DBSCAN confirmed real spatial cluster' : 'May be a grid boundary artifact'}
                </p>
              </div>
            </div>

            {/* Anomaly flag */}
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center border ${hotspot.ai_risk_flag ? 'bg-critical-bg border-critical/30 text-critical' : 'bg-surface border-border text-muted'}`}>
                {hotspot.ai_risk_flag ? (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                ) : (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                )}
              </div>
              <div>
                <p className={`text-xs font-semibold ${hotspot.ai_risk_flag ? 'text-critical' : 'text-muted'}`}>
                  {hotspot.ai_risk_flag ? 'Emerging Risk Detected' : 'Within normal range'}
                </p>
                <p className="text-xs text-muted mt-0.5">
                  {hotspot.ai_risk_flag ? 'Flagged as anomalous vs. station peers' : 'No anomaly detected by Isolation Forest'}
                </p>
              </div>
            </div>

            {/* Anomaly score */}
            <div className="flex items-center justify-between px-1 mt-0.5">
              <span className="text-2xs text-muted">Anomaly score</span>
              <span className="text-2xs font-mono text-secondary-text">{hotspot.ai_anomaly_score?.toFixed(3) ?? '—'}</span>
            </div>
          </div>
        </div>

        {/* CIS Score Contributor Breakdown */}
        <div className="rounded-xl bg-surface-2 border border-border p-4 shadow-sm">
          <p className="text-xs text-primary-text mb-4 font-semibold flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
            Score Contributors
          </p>
          <div className="flex flex-col gap-3.5">
            <CisContributorBar label="Violation Severity" value={severityContrib} color="#F97316" />
            <CisContributorBar label="Peak Hour Impact" value={peakContrib} color="#EAB308" />
            <CisContributorBar label="Volume Factor" value={volumeContrib} color="#9090A8" />
            {junctionContrib > 0 && (
              <CisContributorBar label="Junction Proximity" value={junctionContrib} color="#EF4444" />
            )}
          </div>
        </div>

        {/* Dominant Violation Types */}
        <div>
          <p className="text-xs text-primary-text mb-3 font-semibold flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
            Dominant Violations
          </p>
          <div className="flex flex-col gap-2">
            {hotspot.dominant_violation_types.map((vt) => (
              <div
                key={vt.type}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg border text-xs shadow-sm ${violationBadgeStyle(vt.type)}`}
              >
                <span className="font-semibold">{vt.type}</span>
                <span className="font-mono text-xs opacity-80">{vt.count}×</span>
              </div>
            ))}
            {hotspot.dominant_violation_types.length === 0 && (
              <p className="text-xs text-muted italic px-1">No violation type data</p>
            )}
          </div>
        </div>

        {/* Why this score */}
        <div className="rounded-xl bg-surface-2 border border-border p-3">
          <p className="text-2xs text-muted uppercase tracking-wider mb-2 font-semibold">
            Why this score?
          </p>
          <p className="text-xs text-secondary-text leading-relaxed">
            {formatCisExplanation(hotspot)}
          </p>
        </div>

        {/* Dispatch button */}
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="
            flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl
            bg-accent/10 border border-accent/30 text-accent text-xs font-semibold
            hover:bg-accent/20 hover:border-accent/50 transition-all duration-200
          "
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="3 11 22 2 13 21 11 13 3 11"/>
          </svg>
          Dispatch Officer → Google Maps
        </a>
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-border bg-surface-2">
        <p className="text-2xs text-muted font-mono truncate" title={hotspot.h3_index}>
          H3 · {hotspot.h3_index}
        </p>
      </div>
    </aside>
  );
}
