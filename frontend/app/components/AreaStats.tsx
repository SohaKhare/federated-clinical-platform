"use client";
import { useEffect, useState } from 'react';
import styles from './AreaStats.module.css';
import { Eye, Shield, Activity } from 'lucide-react';
import { api, type ResearchSummary } from '@/lib/api';

export default function AreaStats() {
  const [summary, setSummary] = useState<ResearchSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.getResearchSummary()
      .then((s) => {
        if (!cancelled) setSummary(s);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const total = summary ? Object.values(summary.sex_breakdown).reduce((a, b) => a + b, 0) : 0;
  const femalePct = total > 0 ? Math.round(((summary?.sex_breakdown['F'] ?? 0) / total) * 100) : 0;
  const malePct = total > 0 ? Math.round(((summary?.sex_breakdown['M'] ?? 0) / total) * 100) : 0;
  const avgAge = summary ? Math.round(summary.age.average) : 0;
  const topDiagnosis = summary?.top_diagnosed_diseases[0];
  const diagnosisShare =
    summary && topDiagnosis && summary.total_patients > 0
      ? Math.round((topDiagnosis.count / summary.total_patients) * 100)
      : 0;

  const sliders = [
    { label: 'Female', pct: femalePct, color: '#e2d9ec', icon: <Eye size={14} />, active: false },
    { label: 'Male', pct: malePct, color: '#d9e2ec', icon: <Shield size={14} />, active: false },
    { label: 'Avg Age', pct: Math.min(100, avgAge), display: `${avgAge} yrs`, color: '#1a1a1a', icon: <Activity size={14} />, active: true },
    {
      label: topDiagnosis?.diagnosis ?? 'Top Diagnosis',
      pct: diagnosisShare,
      color: '#d9ecea',
      icon: <Shield size={14} />,
      active: false,
    },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>Demographics</h3>
        <span className={styles.subtitle}>Patient distribution</span>
      </div>

      {!summary ? (
        <div className={styles.sliders}>
          <span className={styles.sliderValue}>Loading…</span>
        </div>
      ) : (
        <div className={styles.sliders}>
          {sliders.map((s) => (
            <div key={s.label} className={styles.sliderCol} title={s.label}>
              <div className={styles.sliderTrack}>
                <div
                  className={styles.sliderFill}
                  style={{ height: `${Math.max(2, s.pct)}%`, backgroundColor: s.color }}
                ></div>
              </div>
              <span className={styles.sliderValue}>{'display' in s && s.display ? s.display : `${s.pct}%`}</span>
              <div className={`${styles.iconWrapper} ${s.active ? styles.iconActive : ''}`}>{s.icon}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
