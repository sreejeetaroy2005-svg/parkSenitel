import React, { useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export function SidebarCharts(): React.JSX.Element {
  const { state } = useAppContext();
  const { hotspots, minCisScore, selectedViolationTypes } = state;

  const filteredHotspots = useMemo(() => {
    return hotspots.filter((h) => {
      if (h.cis_normalized < minCisScore) return false;
      if (selectedViolationTypes.length > 0) {
        const hasSelectedType = h.dominant_violation_types.some((dom) =>
          selectedViolationTypes.includes(dom.type)
        );
        if (!hasSelectedType) return false;
      }
      return true;
    });
  }, [hotspots, minCisScore, selectedViolationTypes]);

  const chartData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const h of filteredHotspots) {
      for (const dom of h.dominant_violation_types) {
        counts[dom.type] = (counts[dom.type] || 0) + dom.count;
      }
    }
    const data = Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5); // top 5 violations

    return data;
  }, [filteredHotspots]);

  if (filteredHotspots.length === 0 || chartData.length === 0) return <></>;

  return (
    <div className="px-4 py-3 border-b border-border animate-fade-in">
      <h3 className="text-xs font-semibold text-primary-text uppercase tracking-wider mb-2">
        Top Violations (Filtered)
      </h3>
      <div className="h-32 w-full text-xs text-secondary-text">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
            <XAxis type="number" hide />
            <YAxis 
              dataKey="name" 
              type="category" 
              width={100} 
              tick={{ fill: '#A0AEC0', fontSize: 10 }} 
              axisLine={false} 
              tickLine={false} 
              tickFormatter={(val: string) => val.length > 15 ? val.substring(0, 15) + '...' : val}
            />
            <Tooltip 
              cursor={{ fill: '#2D3748', opacity: 0.4 }}
              contentStyle={{ backgroundColor: '#1A202C', borderColor: '#4A5568', borderRadius: '4px', fontSize: '12px' }}
              itemStyle={{ color: '#F5A623' }}
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {chartData.map((_, index) => (
                <Cell key={`cell-${index}`} fill="#F5A623" />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
