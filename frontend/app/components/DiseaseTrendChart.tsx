"use client";
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts';
import { api, type DiseaseTrends } from '@/lib/api';

const LINE_COLORS = ['#0d9488', '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6', '#10b981'];

/**
 * Historical disease counts over time, aggregated by diagnosis_date.
 * Kept separate from the prediction model — this is descriptive analytics
 * only (see federated/src/federated/disease_model.py::disease_trends).
 */
export default function DiseaseTrendChart() {
  const [trends, setTrends] = useState<DiseaseTrends | null>(null);
  const [granularity, setGranularity] = useState<'month' | 'year'>('month');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.getDiseaseTrends(granularity)
      .then((data) => {
        setTrends(data[0] ?? null);
        setError('');
      })
      .catch(() => setError('Unable to load disease trends.'));
  }, [granularity]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  // Top diseases by total volume so the chart stays readable; everything
  // else is folded into "Other".
  const { chartData, topDiseases } = useMemo(() => {
    if (!trends) return { chartData: [], topDiseases: [] as string[] };
    const totals = new Map<string, number>();
    for (const point of trends.points) {
      for (const disease of trends.diseases) {
        const value = Number(point[disease] ?? 0);
        totals.set(disease, (totals.get(disease) ?? 0) + value);
      }
    }
    const top = [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([disease]) => disease);

    const data = trends.points.map((point) => {
      const row: Record<string, string | number> = { period: point.period };
      let other = 0;
      for (const disease of trends.diseases) {
        const value = Number(point[disease] ?? 0);
        if (top.includes(disease)) {
          row[disease] = value;
        } else {
          other += value;
        }
      }
      if (other > 0) row.Other = other;
      return row;
    });
    return { chartData: data, topDiseases: top };
  }, [trends]);

  const seriesKeys = [...topDiseases];
  const hasOther = chartData.some((row) => Number((row as Record<string, unknown>).Other ?? 0) > 0);
  if (hasOther) seriesKeys.push('Other');

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Disease Trends Over Time</h3>
          <span style={{ fontSize: 11, color: '#64748b' }}>
            Diagnoses aggregated by diagnosis_date · {trends ? `${trends.points.length} periods` : 'loading…'}
          </span>
        </div>
        <select
          value={granularity}
          onChange={(e) => setGranularity(e.target.value as 'month' | 'year')}
          style={{
            border: '1px solid #e2e8f0',
            borderRadius: 6,
            fontSize: 11,
            padding: '3px 6px',
            background: '#f8fafc',
          }}
          aria-label="Trend granularity"
        >
          <option value="month">Monthly ⌵</option>
          <option value="year">Yearly ⌵</option>
        </select>
      </div>

      {error && <p style={{ fontSize: 11, color: '#94a3b8' }}>{error}</p>}

      <div style={{ width: '100%', height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 12, left: -18, bottom: 0 }}>
            <XAxis
              dataKey="period"
              tickLine={false}
              axisLine={{ stroke: '#f1f5f9' }}
              tick={{ fill: '#64748b', fontSize: 9 }}
            />
            <YAxis
              tickLine={false}
              axisLine={{ stroke: '#f1f5f9' }}
              tick={{ fill: '#64748b', fontSize: 10 }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                fontSize: '0.72rem',
                boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
              }}
            />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            {seriesKeys.map((key, i) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={LINE_COLORS[i % LINE_COLORS.length]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}