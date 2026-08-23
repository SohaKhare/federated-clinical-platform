"use client";
import { useEffect, useState } from 'react';
import styles from './SummaryChart.module.css';
import { BarChart, Bar, ResponsiveContainer, Cell } from 'recharts';
import { api, type ResearchSummary, type PrivacyParameters } from '@/lib/api';

export default function SummaryChart() {
  const [summary, setSummary] = useState<ResearchSummary | null>(null);
  const [privacy, setPrivacy] = useState<PrivacyParameters | null>(null);

  useEffect(() => {
    api.getResearchSummary().then(setSummary).catch(() => {});
    api.getPrivacyParameters().then(setPrivacy).catch(() => {});
  }, []);

  // Build bar chart from top diagnoses (real data) or fallback to sex breakdown
  const chartData = summary
    ? summary.top_diagnosed_diseases.length > 0
      ? summary.top_diagnosed_diseases.map((d, i) => ({
          name: d.diagnosis,
          value: d.count,
          fill: ['#1a1a1a', '#333333', '#555555', '#777777', '#999999', '#b8cfcd'][i % 6],
        }))
      : Object.entries(summary.sex_breakdown).map(([sex, count], i) => ({
          name: sex === 'F' ? 'Female' : sex === 'M' ? 'Male' : sex,
          value: count,
          fill: i === 0 ? '#1a1a1a' : '#b8cfcd',
        }))
    : [];

  return (
    <div className={styles.chartWrapper}>
      {/* Main Chart Box */}
      <div className={styles.chartContainer}>
        <div className={styles.chartHeader}>
          <div className={styles.headerLeft}>
            <span className={styles.badge}>Research</span>
            <h2 className={styles.title}>Hospital Overview</h2>
          </div>
          <div className={styles.headerRight}>
            <div className={styles.legend}>
              <span className={styles.legendDot}></span> Top Diagnoses
            </div>
            <div className={styles.legend}>
              <span className={styles.legendDotLight}></span> Other
            </div>
          </div>
        </div>

        <div className={styles.contentArea}>
          <div className={styles.statsCard}>
            <div className={styles.statLine}>
              <span className={styles.statName}>Total patients</span>
              <div className={styles.statValueRow}>
                 <span className={styles.bigNum}>{summary?.total_patients ?? '—'}</span>
              </div>
            </div>
            <div className={styles.divider}></div>
            <div className={styles.statLine}>
              <span className={styles.statName}>
                Differential Privacy: {privacy ? (privacy.dp_enabled ? `ε=${privacy.epsilon}` : 'Not yet measured') : '…'}
              </span>
              <div className={styles.statActions}>
                 <span className={styles.actionBtn}>
                   Age range: {summary ? `${summary.age.min}–${summary.age.max}` : '—'}
                 </span>
              </div>
            </div>
          </div>

          <div className={styles.barArea}>
             <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barSize={24}>
                <Bar dataKey="value" radius={[6, 6, 6, 6]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
