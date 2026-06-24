import React, { useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

// ---------------------------------------------------------------------------
// Shared tooltip style
// ---------------------------------------------------------------------------
const tooltipStyle: React.CSSProperties = {
  backgroundColor: 'rgba(22, 22, 26, 0.85)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  borderColor: 'rgba(255,255,255,0.05)',
  borderRadius: '8px',
  boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
  fontSize: '12px',
  color: '#EEEEF5',
};
const tooltipItemStyle: React.CSSProperties = { color: '#EEEEF5', fontWeight: 600 };
const tooltipLabelStyle: React.CSSProperties = { color: '#9090A8', marginBottom: '4px' };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SidebarCharts(): React.JSX.Element {
  const { state } = useAppContext();
  const { hotspots, minCisScore, selectedViolationTypes } = state;

  const filteredHotspots = useMemo(() => {
    return hotspots.filter((h) => {
      if (h.cis_normalized < minCisScore) return false;
      if (selectedViolationTypes.length > 0) {
        const hasSelectedType = h.dominant_violation_types.some((dom) =>
          selectedViolationTypes.includes(dom.type),
        );
        if (!hasSelectedType) return false;
      }
      return true;
    });
  }, [hotspots, minCisScore, selectedViolationTypes]);

  // ------------------------------------------------------------------
  // Chart 1: Top violations by frequency
  // ------------------------------------------------------------------
  const violationChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const h of filteredHotspots) {
      for (const dom of h.dominant_violation_types) {
        counts[dom.type] = (counts[dom.type] || 0) + dom.count;
      }
    }
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [filteredHotspots]);

  // --- Chart 2: Violations by peak_hour_label ---
  const peakHourData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const h of filteredHotspots) {
      const label = h.peak_hour_label;
      counts[label] = (counts[label] || 0) + h.violation_count;
    }
    return Object.entries(counts)
      .map(([label, count]) => ({
        label,
        // Truncate "08:00–09:00 IST" → "08–09"
        shortLabel: label.replace(/:00/g, '').replace(' IST', '').trim(),
        count,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [filteredHotspots]);

  const showPeakChart = peakHourData.length >= 3;
  const maxPeakCount = showPeakChart ? Math.max(...peakHourData.map((d) => d.count)) : 0;

  if (filteredHotspots.length === 0 || violationChartData.length === 0) return <></>;

  return (
    <div className="border-b border-border animate-fade-in">
      {/* ── Chart 1: Top Violations ── */}
      <div className="px-4 py-4 border-b border-border">
        <h3 className="text-xs font-semibold text-primary-text uppercase tracking-wider mb-4 flex items-center gap-1.5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
          Top Violations
        </h3>
        <div className="w-full text-xs text-secondary-text" style={{ height: 140 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={violationChartData} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
              <XAxis type="number" hide />
              <YAxis
                dataKey="name"
                type="category"
                width={110}
                tick={{ fill: '#9090A8', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(val: string) => val.length > 15 ? val.substring(0, 15) + '…' : val}
              />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                contentStyle={tooltipStyle}
                itemStyle={tooltipItemStyle}
                labelStyle={tooltipLabelStyle}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={12}>
                {violationChartData.map((_, index) => (
                  <Cell key={`vcell-${index}`} fill="#F5A623" />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Chart 2: Violation peak hours ── */}
      {showPeakChart && (
        <div className="px-4 py-4">
          <h3 className="text-xs font-semibold text-primary-text uppercase tracking-wider mb-4 flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            Peak Hours
          </h3>
          <div className="w-full text-xs text-secondary-text" style={{ height: 120 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={peakHourData}
                margin={{ top: 4, right: 4, left: -28, bottom: 0 }}
              >
                <XAxis
                  dataKey="shortLabel"
                  tick={{ fill: '#9090A8', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                />
                <YAxis hide />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                  contentStyle={tooltipStyle}
                  itemStyle={tooltipItemStyle}
                  labelStyle={tooltipLabelStyle}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={16}>
                  {peakHourData.map((entry, index) => (
                    <Cell
                      key={`pcell-${index}`}
                      fill={entry.count === maxPeakCount ? '#E74C3C' : '#F5A623'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
