"use client";
import React, { useState } from 'react';
import styles from './ModelPerformanceWidget.module.css';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

const performanceData = [
  { round: 'R1', accuracy: 35, loss: 0.65 },
  { round: 'R2', accuracy: 56, loss: 0.48 },
  { round: 'R3', accuracy: 67, loss: 0.38 },
  { round: 'R4', accuracy: 77, loss: 0.28 },
  { round: 'R5', accuracy: 83, loss: 0.21 },
  { round: 'R6', accuracy: 96, loss: 0.12 },
];

export default function ModelPerformanceWidget() {
  const [metric, setMetric] = useState<'accuracy' | 'loss'>('accuracy');

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div>
          <h3 className={styles.title}>Model Performance</h3>
          <span className={styles.subtitle}>Global model accuracy over rounds</span>
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
            <YAxis
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tickFormatter={(v) => `${v}%`}
              tickLine={false}
              axisLine={{ stroke: '#f1f5f9' }}
              tick={{ fill: '#64748b', fontSize: 10 }}
            />
            <Tooltip
              formatter={(val: any) => [`${val}%`, 'Accuracy']}
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
      </div>
    </div>
  );
}
