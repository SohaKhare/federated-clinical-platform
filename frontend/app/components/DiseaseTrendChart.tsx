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
import styles from './DiseaseTrendChart.module.css';

const LINE_COLORS = ['#0d9488', '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6', '#10b981'];

/**
 * Historical disease counts over time, aggregated by diagnosis_date.
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
      .slice(0, 4)
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
    <div className={styles.card}>
      <div className={styles.header}>
        <div>
          <h3 className={styles.title}>Disease Trends</h3>
          <span className={styles.subtitle}>
            Over time · {trends ? `${trends.points.length} periods` : 'loading…'}
          </span>
        </div>
        <select
          value={granularity}
          onChange={(e) => setGranularity(e.target.value as 'month' | 'year')}
          className={styles.dropdownSelect}
          aria-label="Trend granularity"
        >
          <option value="month">Monthly</option>
          <option value="year">Yearly</option>
        </select>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.chartContainer}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 6, left: -22, bottom: -4 }}>
            <XAxis
              dataKey="period"
              tickLine={false}
              axisLine={{ stroke: '#f1f5f9' }}
              tick={{ fill: '#64748b', fontSize: 8 }}
            />
            <YAxis
              tickLine={false}
              axisLine={{ stroke: '#f1f5f9' }}
              tick={{ fill: '#64748b', fontSize: 8 }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                fontSize: '0.7rem',
                boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                padding: '4px 8px',
              }}
            />
            <Legend wrapperStyle={{ fontSize: '8px', paddingTop: '2px' }} />
            {seriesKeys.map((key, i) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={LINE_COLORS[i % LINE_COLORS.length]}
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 3 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}