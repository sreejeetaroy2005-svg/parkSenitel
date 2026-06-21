import React, { useState, useCallback } from 'react';
import type { Hotspot } from '../types/index';
import { formatAddress } from '../utils/formatters';
import { cisToColor } from '../utils/colors';
import { useAppContext } from '../context/AppContext';

type SortKey = 'cis_normalized' | 'violation_count' | 'peak_hour_label';
type SortDir = 'asc' | 'desc';

interface HotspotTableProps {
  hotspots: Hotspot[];
}

function CisBar({ value }: { value: number }): React.JSX.Element {
  const color = cisToColor(value);
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-border overflow-hidden flex-none">
        <div
          className="h-full rounded-full"
          style={{ width: `${value}%`, background: color }}
        />
      </div>
      <span className="font-mono text-xs" style={{ color }}>{value.toFixed(0)}</span>
    </div>
  );
}

/**
 * Ranked table of hotspots with sortable columns and CSV export.
 * Default sort: CIS descending.
 */
export function HotspotTable({ hotspots }: HotspotTableProps): React.JSX.Element {
  const { state, dispatch } = useAppContext();
  const { selectedHotspot } = state;

  const [sortKey, setSortKey] = useState<SortKey>('cis_normalized');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const toggleSort = useCallback(
    (key: SortKey) => {
      if (key === sortKey) {
        setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
      } else {
        setSortKey(key);
        setSortDir('desc');
      }
    },
    [sortKey]
  );

  const sorted = [...hotspots].sort((a, b) => {
    let av: number | string = a[sortKey];
    let bv: number | string = b[sortKey];
    if (typeof av === 'string') av = av.toLowerCase();
    if (typeof bv === 'string') bv = bv.toLowerCase();
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const exportCsv = () => {
    const header = ['Rank', 'Address', 'Violations', 'Top Violation', 'Peak Hour', 'CIS Score', 'CIS (0-100)', 'Junction', 'AI Cluster Validated', 'AI Risk Flag'];
    const rows = sorted.map((h, i) => [
      i + 1,
      `"${formatAddress(h).replace(/"/g, '""')}"`,
      h.violation_count,
      `"${h.dominant_violation_types[0]?.type ?? ''}"`,
      h.peak_hour_label,
      h.cis.toFixed(2),
      h.cis_normalized.toFixed(2),
      h.junction_flag ? 'Yes' : 'No',
      h.ai_cluster_validated ? 'Yes' : 'No',
      h.ai_risk_flag ? 'Yes' : 'No',
    ]);
    const csv = [header, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hotspots_${state.selectedStation?.name ?? 'export'}.csv`.replace(/\s+/g, '_').toLowerCase();
    a.click();
    URL.revokeObjectURL(url);
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (col !== sortKey) {
      return (
        <svg className="inline ml-1 opacity-30" width="10" height="10" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      );
    }
    return sortDir === 'desc' ? (
      <svg className="inline ml-1 text-accent" width="10" height="10" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    ) : (
      <svg className="inline ml-1 text-accent" width="10" height="10" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
        <polyline points="18 15 12 9 6 15"/>
      </svg>
    );
  };

  if (hotspots.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted text-sm font-body">
        No hotspots to display
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-none">
        <p className="text-sm font-body text-secondary-text">
          <span className="font-semibold text-primary-text">{hotspots.length}</span> hotspots
          {state.selectedStation && (
            <span className="text-muted"> in {state.selectedStation.name}</span>
          )}
        </p>
        <button
          id="hotspot-table-export"
          onClick={exportCsv}
          className="
            flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-body font-medium
            border border-border text-secondary-text hover:text-primary-text hover:border-accent
            transition-colors duration-150
          "
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            aria-hidden="true">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm font-body border-collapse">
          <thead className="sticky top-0 bg-surface z-10">
            <tr className="border-b border-border">
              <th className="text-left px-4 py-2.5 text-2xs font-body font-medium text-muted uppercase tracking-widest w-10">
                #
              </th>
              <th className="text-left px-4 py-2.5 text-2xs font-body font-medium text-muted uppercase tracking-widest">
                Location
              </th>
              <th
                className="text-left px-4 py-2.5 text-2xs font-body font-medium text-muted uppercase tracking-widest cursor-pointer hover:text-primary-text select-none"
                onClick={() => toggleSort('violation_count')}
              >
                Violations <SortIcon col="violation_count" />
              </th>
              <th className="text-left px-4 py-2.5 text-2xs font-body font-medium text-muted uppercase tracking-widest hidden md:table-cell">
                Top Violation
              </th>
              <th
                className="text-left px-4 py-2.5 text-2xs font-body font-medium text-muted uppercase tracking-widest cursor-pointer hover:text-primary-text select-none hidden lg:table-cell"
                onClick={() => toggleSort('peak_hour_label')}
              >
                Peak Hour <SortIcon col="peak_hour_label" />
              </th>
              <th
                className="text-left px-4 py-2.5 text-2xs font-body font-medium text-muted uppercase tracking-widest cursor-pointer hover:text-primary-text select-none"
                onClick={() => toggleSort('cis_normalized')}
              >
                CIS Score <SortIcon col="cis_normalized" />
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((hotspot, idx) => {
              const isSelected = selectedHotspot?.h3_index === hotspot.h3_index;
              return (
                <tr
                  key={hotspot.h3_index}
                  onClick={() =>
                    dispatch({
                      type: 'SELECT_HOTSPOT',
                      payload: isSelected ? null : hotspot,
                    })
                  }
                  className={`
                    border-b border-border cursor-pointer transition-colors duration-75
                    ${isSelected
                      ? 'bg-accent/10 border-accent/20'
                      : 'hover:bg-surface-2'
                    }
                  `}
                >
                  <td className="px-4 py-3 text-muted font-mono text-2xs">{idx + 1}</td>
                  <td className="px-4 py-3">
                    <div className="max-w-[160px] truncate text-primary-text" title={formatAddress(hotspot)}>
                      {formatAddress(hotspot)}
                    </div>
                    {hotspot.junction_flag && (
                      <span className="text-2xs text-accent mr-2">⚠ Junction</span>
                    )}
                    {hotspot.ai_risk_flag && (
                      <span className="text-2xs text-danger-light">⚡ AI Risk</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-primary-text">
                    {hotspot.violation_count.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-xs text-secondary-text truncate block max-w-[140px]">
                      {hotspot.dominant_violation_types[0]?.type ?? '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className="font-mono text-xs text-accent">{hotspot.peak_hour_label}</span>
                  </td>
                  <td className="px-4 py-3">
                    <CisBar value={hotspot.cis_normalized} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
