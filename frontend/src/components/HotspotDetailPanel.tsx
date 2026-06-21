import React from 'react';
import type { Hotspot } from '../types/index';
import { formatAddress, formatCisExplanation } from '../utils/formatters';
import { cisToColor } from '../utils/colors';
import { useAppContext } from '../context/AppContext';

interface HotspotDetailPanelProps {
  hotspot: Hotspot;
}

/** Severity badge color per violation type keyword */
function violationBadgeStyle(type: string): string {
  const t = type.toUpperCase();
  if (t.includes('OBSTRUCTION') || t.includes('BLOCKING')) return 'bg-danger/20 text-danger-light border-danger/30';
  if (t.includes('MAIN ROAD') || t.includes('DOUBLE') || t.includes('CROSSING')) return 'bg-accent/20 text-accent border-accent/30';
  return 'bg-surface text-secondary-text border-border';
}

/**
 * Slide-in right panel showing hotspot detail:
 * address, violation count, top-3 type badges, peak hour,
 * CIS score bar, and plain-English CIS explanation.
 */
export function HotspotDetailPanel({ hotspot }: HotspotDetailPanelProps): React.JSX.Element {
  const { dispatch } = useAppContext();

  const close = () => dispatch({ type: 'SELECT_HOTSPOT', payload: null });

  const cisColor = cisToColor(hotspot.cis_normalized);
  const cisLabel = hotspot.cis_normalized >= 75
    ? 'Critical'
    : hotspot.cis_normalized >= 50
    ? 'High'
    : hotspot.cis_normalized >= 25
    ? 'Moderate'
    : 'Low';

  return (
    <aside
      className="
        animate-slide-right
        absolute right-0 top-0 h-full w-80
        bg-surface border-l border-border
        flex flex-col overflow-hidden
        shadow-panel z-10
      "
      aria-label="Hotspot detail"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 p-4 border-b border-border">
        <div className="flex-1 min-w-0">
          <p className="text-2xs font-body text-muted uppercase tracking-widest mb-1">Hotspot Detail</p>
          <h2
            className="font-display text-base font-semibold text-primary-text leading-tight truncate"
            title={formatAddress(hotspot)}
          >
            {formatAddress(hotspot)}
          </h2>
        </div>
        <button
          id="hotspot-panel-close"
          onClick={close}
          aria-label="Close hotspot detail"
          className="
            flex-none mt-0.5 p-1.5 rounded
            text-muted hover:text-primary-text hover:bg-surface-2
            transition-colors duration-150
          "
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Body — scrollable */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">

        {/* CIS Score card */}
        <div className="rounded-md bg-surface-2 border border-border p-4">
          <div className="flex items-end justify-between mb-2">
            <span className="text-2xs font-body text-muted uppercase tracking-widest">
              Congestion Impact Score
            </span>
            <span
              className="font-display font-bold text-2xl leading-none"
              style={{ color: cisColor }}
            >
              {hotspot.cis_normalized.toFixed(0)}
            </span>
          </div>

          {/* Score bar */}
          <div className="h-2 rounded-full bg-border overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${hotspot.cis_normalized}%`,
                background: `linear-gradient(90deg, #F5A623, ${cisColor})`,
              }}
            />
          </div>

          <div className="flex justify-between mt-1.5">
            <span className="text-2xs text-muted font-body">Low</span>
            <span
              className="text-2xs font-body font-semibold"
              style={{ color: cisColor }}
            >
              {cisLabel}
            </span>
            <span className="text-2xs text-muted font-body">Critical</span>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md bg-surface-2 border border-border p-3">
            <p className="text-2xs text-muted font-body uppercase tracking-widest mb-1">Violations</p>
            <p className="font-display text-xl font-bold text-primary-text">
              {hotspot.violation_count.toLocaleString()}
            </p>
          </div>
          <div className="rounded-md bg-surface-2 border border-border p-3">
            <p className="text-2xs text-muted font-body uppercase tracking-widest mb-1">Peak Hour</p>
            <p className="font-mono text-sm font-medium text-accent leading-tight">
              {hotspot.peak_hour_label}
            </p>
          </div>
        </div>

        {/* Junction flag */}
        {hotspot.junction_flag && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-accent/10 border border-accent/20">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="#F5A623" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              aria-hidden="true">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span className="text-xs text-accent font-body font-medium">
              Junction proximity — score boosted ×1.3
            </span>
          </div>
        )}

        {/* AI Insights */}
        <div className="flex flex-col gap-2">
          {hotspot.ai_cluster_validated ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-accent/10 border border-accent/20">
              <span className="text-xs text-accent font-body font-medium">
                ✓ DBSCAN-confirmed density cluster
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-surface border border-border">
              <span className="text-xs text-secondary-text font-body font-medium">
                ⚠ Not confirmed by density clustering
              </span>
            </div>
          )}
          {hotspot.ai_risk_flag && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-danger-light/10 border border-danger-light/20">
              <span className="text-xs text-danger-light font-body font-medium">
                ⚡ Emerging risk — flagged as anomalous vs. station peers
              </span>
            </div>
          )}
        </div>

        {/* Top violation types */}
        <div>
          <p className="text-2xs text-muted font-body uppercase tracking-widest mb-2">
            Dominant Violation Types
          </p>
          <div className="flex flex-col gap-1.5">
            {hotspot.dominant_violation_types.map((vt) => (
              <div
                key={vt.type}
                className={`flex items-center justify-between px-3 py-2 rounded border text-xs font-body ${violationBadgeStyle(vt.type)}`}
              >
                <span className="font-medium">{vt.type}</span>
                <span className="font-mono text-2xs opacity-80">{vt.count}×</span>
              </div>
            ))}
            {hotspot.dominant_violation_types.length === 0 && (
              <p className="text-xs text-muted italic">No violation type data</p>
            )}
          </div>
        </div>

        {/* CIS explanation */}
        <div className="rounded-md bg-surface-2 border border-border p-3">
          <p className="text-2xs text-muted font-body uppercase tracking-widest mb-1.5">
            Why this score?
          </p>
          <p className="text-xs text-secondary-text font-body leading-relaxed">
            {formatCisExplanation(hotspot)}
          </p>
        </div>

        {/* Raw CIS */}
        <div className="flex items-center justify-between text-2xs text-muted font-mono">
          <span>Raw CIS</span>
          <span>{hotspot.cis.toFixed(2)}</span>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border">
        <p className="text-2xs text-muted font-mono truncate" title={hotspot.h3_index}>
          H3 {hotspot.h3_index}
        </p>
      </div>
    </aside>
  );
}
