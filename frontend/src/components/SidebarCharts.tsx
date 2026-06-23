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
  backgroundColor: '#1A202C',
  borderColor: '#4A5568',
  borderRadius: '4px',
  fontSize: '12px',
};
const tooltipItemStyle: React.CSSProperties = { color: '#F5A623' };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Truncate IST hour label e.g. "08:00–09:00 IST" → "08–09" */
function shortHour(label: string): string {
  return label.replace(' IST', '').replace(/:00/g, '').trim();
}

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

  // ------------------------------------------------------------------
  // Chart 2: Violations by peak_hour_label
  // ------------------------------------------------------------------
  const peakHourChartData = useMemo(() => {
    const buckets: Record<string, { label: string; count: number }> = {};
    for (const h of filteredHotspots) {
      const key = h.peak_hour_label;
      if (!buckets[key]) {
        buckets[key] = { label: shortHour(key), count: 0 };
      }
      buckets[key].count += h.violation_count;
    }
    return Object.values(buckets).sort((a, b) => a.label.localeCompare(b.label));
  }, [filteredHotspots]);

  const distinctPeakLabels = new Set(filteredHotspots.map((h) => h.peak_hour_label)).size;
  const showPeakChart = distinctPeakLabels >= 3;

  // Max count for colour differentiation
  const maxPeakCount = Math.max(...peakHourChartData.map((d) => d.count), 0);

  if (filteredHotspots.length === 0 || violationChartData.length === 0) return <></>;

  return (
    <div className="animate-fade-in border-b border-border min-w-[250px]">
      {/* --- Chart 1: Top Violations (Filtered) --- */}
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-xs font-semibold text-primary-text uppercase tracking-wider mb-2">
          Top Violations (Filtered)
        </h3>
        <div className="h-32 w-full min-h-32 text-xs text-secondary-text">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={violationChartData}
              layout="vertical"
              margin={{ top: 0, right: 10, left: 0, bottom: 0 }}
            >
              <XAxis type="number" hide />
              <YAxis
                dataKey="name"
                type="category"
                width={100}
                tick={{ fill: '#A0AEC0', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(val: string) =>
                  val.length > 15 ? val.substring(0, 15) + '…' : val
                }
              />
              <Tooltip
                cursor={{ fill: '#2D3748', opacity: 0.4 }}
                contentStyle={tooltipStyle}
                itemStyle={tooltipItemStyle}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {violationChartData.map((_, index) => (
                  <Cell key={`cell-v-${index}`} fill="#F5A623" />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* --- Chart 2: Violation Peak Hours --- */}
      {showPeakChart && (
        <div className="px-4 py-3">
          <h3 className="text-xs font-semibold text-primary-text uppercase tracking-wider mb-2">
            Violation peak hours
          </h3>
          <div className="h-28 w-full min-h-28 text-xs text-secondary-text">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={peakHourChartData}
                margin={{ top: 4, right: 4, left: -28, bottom: 0 }}
              >
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#A0AEC0', fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                />
                <YAxis hide />
                <Tooltip
                  cursor={{ fill: '#2D3748', opacity: 0.4 }}
                  contentStyle={tooltipStyle}
                  itemStyle={tooltipItemStyle}
                />
                <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                  {peakHourChartData.map((entry, index) => (
                    <Cell
                      key={`cell-p-${index}`}
                      fill={entry.count === maxPeakCount ? '#C0392B' : '#F5A623'}
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
