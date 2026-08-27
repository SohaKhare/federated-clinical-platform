"use client";
import React, { useEffect, useState } from 'react';
import styles from './ModelPerformanceWidget.module.css';
import { api, type ModelPerformanceSnapshot } from '../../lib/api';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

interface ChartPoint {
  round: string;
  accuracy: number;
  loss: number;
}

function toChartData(snapshots: ModelPerformanceSnapshot[]): ChartPoint[] {
  return snapshots.map((snapshot) => ({
    round: `R${snapshot.round}`,
    accuracy: Math.round(snapshot.accuracy * 100),
    loss: snapshot.loss,
  }));
}

export default function ModelPerformanceWidget() {
  const [metric, setMetric] = useState<'accuracy' | 'loss'>('accuracy');
  const [performanceData, setPerformanceData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    api.getModelPerformance()
      .then((snapshots) => {
        if (!cancelled) setPerformanceData(toChartData(snapshots));
      })
      .catch((error) => {
        console.error('Failed to load model performance:', error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div>
          <h3 className={styles.title}>Model Performance</h3>
          <span className={styles.subtitle}>
            Global model {metric} over rounds
          </span>
        </div>
        <select
          className={styles.dropdownSelect}
          value={metric}
          onChange={(e) => setMetric(e.target.value as 'accuracy' | 'loss')}
          aria-label="Select metric"
        >
          <option value="accuracy">Accuracy ⌵</option>
          <option value="loss">Loss ⌵</option>
        </select>
      </div>

      <div className={styles.chartContainer}>
        {loading ? (
          <div className={styles.subtitle}>Loading…</div>
        ) : performanceData.length === 0 ? (
          <div className={styles.subtitle}>No evaluated rounds yet.</div>
        ) : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={performanceData}
            margin={{ top: 12, right: 10, left: -24, bottom: 0 }}
          >
            <defs>
              <linearGradient id="accuracyGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#2dd4bf" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="round"
              tickLine={false}
              axisLine={{ stroke: '#f1f5f9' }}
              tick={{ fill: '#64748b', fontSize: 10, fontWeight: 500 }}
              dy={5}
            />
            {metric === 'accuracy' ? (
              <YAxis
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tickFormatter={(v) => `${v}%`}
                tickLine={false}
                axisLine={{ stroke: '#f1f5f9' }}
                tick={{ fill: '#64748b', fontSize: 10 }}
              />
            ) : (
              <YAxis
                domain={[0, 'auto']}
                tickFormatter={(v) => `${v}`}
                tickLine={false}
                axisLine={{ stroke: '#f1f5f9' }}
                tick={{ fill: '#64748b', fontSize: 10 }}
              />
            )}
            <Tooltip
              formatter={(val: unknown) => [
                metric === 'accuracy' ? `${val}%` : String(val ?? ''),
                metric === 'accuracy' ? 'Accuracy' : 'Loss',
              ]}
              contentStyle={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                fontSize: '0.75rem',
                boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
              }}
            />
            <Area
              type="monotone"
              dataKey={metric}
              stroke="#0d9488"
              strokeWidth={2.2}
              fillOpacity={1}
              fill="url(#accuracyGrad)"
              dot={{ r: 3.5, fill: '#0d9488', stroke: '#ffffff', strokeWidth: 1.5 }}
              activeDot={{ r: 5, fill: '#0d9488', stroke: '#ffffff', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
