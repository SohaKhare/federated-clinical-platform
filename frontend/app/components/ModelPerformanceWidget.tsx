"use client";
import { useCallback, useEffect, useState } from 'react';
import styles from './ModelPerformanceWidget.module.css';
import { api, type DiseaseMetrics } from '@/lib/api';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

export default function ModelPerformanceWidget() {
  const [metrics, setMetrics] = useState<DiseaseMetrics | null>(null);
  const [showConfusion, setShowConfusion] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.getDiseaseMetrics()
      .then(setMetrics)
      .catch(() => setError('Model not trained yet — run training first.'));
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [load]);

  // Trend of per-class recall across the confusion matrix diagonal — a real
  // signal derived from the held-out test set rather than mock round data.
  const chartData = metrics
    ? metrics.classes.map((label, i) => ({
        name: label.length > 14 ? `${label.slice(0, 13)}…` : label,
        accuracy: Math.round(
          ((metrics.confusion_matrix[i]?.[i] ?? 0) /
            Math.max(1, metrics.confusion_matrix[i]?.reduce((a, b) => a + b, 0) ?? 1)) * 100,
        ),
      }))
    : [];
  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div>
          <h3 className={styles.title}>Model Performance</h3>
          <span className={styles.subtitle}>
            CatBoost held-out test-set performance
          </span>
        </div>
        <button className={styles.dropdownSelect} onClick={() => setShowConfusion((v) => !v)}>
          {showConfusion ? 'Hide matrix ⌵' : 'Confusion matrix ⌵'}
        </button>
      </div>

      {metrics && (
        <div style={{ display: 'flex', gap: 12, padding: '0 16px', flexWrap: 'wrap' }}>
          <MetricPill label="Accuracy" value={`${(metrics.accuracy * 100).toFixed(1)}%`} />
          <MetricPill label="Precision" value={`${(metrics.precision * 100).toFixed(1)}%`} />
          <MetricPill label="Recall" value={`${(metrics.recall * 100).toFixed(1)}%`} />
          <MetricPill label="F1" value={`${(metrics.f1 * 100).toFixed(1)}%`} />
        </div>
      )}
      {error && <p style={{ fontSize: 11, color: '#94a3b8', padding: '4px 16px' }}>{error}</p>}

      <div className={styles.chartContainer}>
        {!metrics ? (
          <div className={styles.subtitle}>Waiting for disease-model metrics…</div>
        ) : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 12, right: 10, left: -24, bottom: 0 }}
          >
            <defs>
              <linearGradient id="accuracyGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#2dd4bf" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="name"
              tickLine={false}
              axisLine={{ stroke: '#f1f5f9' }}
              tick={{ fill: '#64748b', fontSize: 9, fontWeight: 500 }}
              dy={5}
              interval={0}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tickFormatter={(v) => `${v}%`}
              tickLine={false}
              axisLine={{ stroke: '#f1f5f9' }}
              tick={{ fill: '#64748b', fontSize: 10 }}
            />
            <Tooltip
              formatter={(value: unknown) => [`${Number(value ?? 0)}%`, 'Recall']}
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
              dataKey="accuracy"
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

      {showConfusion && metrics && (
        <div style={{ overflowX: 'auto', maxHeight: 220, margin: '0 16px 12px' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 10, width: '100%' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: 4, color: '#64748b' }}>actual ↓ / pred →</th>
                {metrics.classes.map((c) => (
                  <th key={c} style={{ padding: 4, color: '#64748b', fontWeight: 600 }}>
                    {c.length > 12 ? `${c.slice(0, 11)}…` : c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metrics.confusion_matrix.map((row, i) => (
                <tr key={metrics.classes[i]}>
                  <td style={{ padding: 4, color: '#64748b', whiteSpace: 'nowrap' }}>
                    {metrics.classes[i].length > 12 ? `${metrics.classes[i].slice(0, 11)}…` : metrics.classes[i]}
                  </td>
                  {row.map((count, j) => (
                    <td
                      key={j}
                      style={{
                        padding: 4,
                        textAlign: 'center',
                        background:
                          i === j ? 'rgba(13,148,136,0.15)' : count > 0 ? 'rgba(239,68,68,0.08)' : 'transparent',
                        borderRadius: 4,
                        fontWeight: i === j ? 700 : 400,
                      }}
                    >
                      {count}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        flex: '1 1 auto',
        minWidth: 70,
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        padding: '6px 8px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5, color: '#64748b' }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#0d9488' }}>{value}</div>
    </div>
  );
}