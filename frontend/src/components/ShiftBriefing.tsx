import React, { useMemo, useCallback, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import type { Hotspot } from '../types/index';

/** Strip IST suffix and trim to "HH–HH" for compact display */
function shortenHourLabel(label: string): string {
  // e.g. "08:00–09:00 IST" → "08–09"
  return label
    .replace(' IST', '')
    .replace(/:00/g, '')
    .trim();
}

/** Render a single row for a top-5 hotspot */
function BriefingRow({
  rank,
  hotspot,
}: {
  rank: number;
  hotspot: Hotspot;
}): React.JSX.Element {
  const address =
    hotspot.sample_address ??
    `${hotspot.latitude.toFixed(4)}, ${hotspot.longitude.toFixed(4)}`;
  const primaryType = hotspot.dominant_violation_types[0]?.type ?? '—';
  const hourShort = shortenHourLabel(hotspot.peak_hour_label);

  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border last:border-b-0 animate-fade-in">
      {/* Rank badge */}
      <div
        className="flex-none w-6 h-6 rounded flex items-center justify-center text-2xs font-display font-bold shrink-0"
        style={{
          background: rank === 1 ? '#F5A623' : rank === 2 ? '#D4891A' : '#3A3A3A',
          color: rank <= 2 ? '#1A1A1A' : '#F5F0E8',
        }}
      >
        {rank}
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <p className="font-mono text-xs text-primary-text truncate leading-tight" title={address}>
          {address}
        </p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1">
          <span className="font-mono text-2xs text-accent uppercase">{primaryType}</span>
          <span className="text-muted text-2xs">|</span>
          <span className="font-mono text-2xs text-secondary-text">Peak: {hourShort}</span>
          <span className="text-muted text-2xs">|</span>
          <span className="font-mono text-2xs text-secondary-text">
            {hotspot.est_delay_minutes.toLocaleString()} veh-min
          </span>
        </div>
      </div>

      {/* CIS bar */}
      <div className="flex-none w-12 flex flex-col items-end gap-0.5">
        <span className="font-display text-base font-bold leading-none text-accent">
          {hotspot.cis_normalized.toFixed(0)}
        </span>
        <div className="h-1 w-full rounded-full bg-border overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: `${hotspot.cis_normalized}%`,
              background: 'linear-gradient(90deg, #F5A623, #C0392B)',
            }}
          />
        </div>
      </div>
    </div>
  );
}

/** Format today's date as "DD MMM YYYY" */
function todayLabel(): string {
  return new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** Build the plain-text version of the briefing */
function buildPlainText(stationName: string, top5: Hotspot[]): string {
  const lines: string[] = [
    `SHIFT BRIEFING — ${stationName}`,
    `Generated: ${todayLabel()}`,
    '',
  ];

  top5.forEach((h, i) => {
    const addr =
      h.sample_address ?? `${h.latitude.toFixed(4)}, ${h.longitude.toFixed(4)}`;
    const type = h.dominant_violation_types[0]?.type ?? 'UNKNOWN';
    lines.push(`#${i + 1} — ${addr}`);
    lines.push(
      `    Type: ${type} | Peak: ${h.peak_hour_label} | Est. delay: ${h.est_delay_minutes.toLocaleString()} veh-min`,
    );
  });

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function ShiftBriefing(): React.JSX.Element | null {
  const { state, dispatch } = useAppContext();
  const { shiftBriefingOpen, hotspots, selectedStation } = state;
  const [copied, setCopied] = useState(false);

  const top5 = useMemo<Hotspot[]>(
    () =>
      [...hotspots]
        .sort((a, b) => b.cis_normalized - a.cis_normalized)
        .slice(0, 5),
    [hotspots],
  );

  const handleCopy = useCallback(() => {
    if (!selectedStation) return;
    const text = buildPlainText(selectedStation.name, top5);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [selectedStation, top5]);

  const close = () => dispatch({ type: 'TOGGLE_SHIFT_BRIEFING' });

  if (!shiftBriefingOpen) return null;

  return (
    <>
      {/* Backdrop — fixed so it covers the full screen behind the panel */}
      <div
        className="fixed inset-0 z-20 bg-shell/50 backdrop-blur-sm"
        onClick={close}
        aria-hidden="true"
      />

      {/* Panel — sits inside the right-anchored wrapper in App.tsx */}
      <aside
        className="
          relative h-full w-80
          bg-surface border-l border-border
          flex flex-col overflow-hidden shadow-panel
          animate-slide-right z-30
        "
        aria-label="Shift Briefing panel"
        role="complementary"
      >
        {/* Header */}
        <div
          className="flex items-start justify-between gap-2 px-4 pt-4 pb-3 border-b border-border"
          style={{ background: 'rgba(245,166,35,0.07)' }}
        >
          <div className="flex-1 min-w-0">
            <p className="text-2xs font-body text-accent uppercase tracking-widest mb-0.5">
              📋 Shift Briefing
            </p>
            <h2 className="font-display text-base font-semibold text-primary-text leading-tight truncate">
              {selectedStation?.name ?? 'No station'}
            </h2>
            <p className="text-2xs font-mono text-muted mt-0.5">{todayLabel()}</p>
          </div>
          <button
            id="shift-briefing-close"
            onClick={close}
            aria-label="Close shift briefing"
            className="
              flex-none mt-0.5 p-1.5 rounded
              text-muted hover:text-primary-text hover:bg-surface-2
              transition-colors duration-150
            "
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Sub-header */}
        <div className="px-4 py-2 border-b border-border">
          <p className="text-2xs font-body text-muted">
            Top 5 hotspots by Congestion Impact Score
          </p>
        </div>

        {/* Hotspot rows */}
        <div className="flex-1 overflow-y-auto px-4">
          {top5.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted italic font-body">
              No hotspot data available.
            </p>
          ) : (
            top5.map((h, i) => (
              <BriefingRow key={h.h3_index} rank={i + 1} hotspot={h} />
            ))
          )}
        </div>

        {/* Footer — copy button */}
        <div className="px-4 py-3 border-t border-border">
          <button
            id="shift-briefing-copy"
            onClick={handleCopy}
            disabled={top5.length === 0}
            className="
              w-full flex items-center justify-center gap-2
              py-2 px-4 rounded text-sm font-body font-medium
              border transition-all duration-150
              disabled:opacity-40 disabled:cursor-not-allowed
            "
            style={{
              background: copied ? 'rgba(245,166,35,0.15)' : 'rgba(245,166,35,0.08)',
              borderColor: '#F5A623',
              color: '#F5A623',
            }}
          >
            {copied ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  aria-hidden="true">
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
