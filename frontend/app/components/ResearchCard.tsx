"use client";
import { useEffect, useState } from 'react';
import styles from './SharedCards.module.css';
import { api, type ResearchSummary, type ResearchInsights } from '../../lib/api';

export default function ResearchPage() {
  const [summary, setSummary] = useState<ResearchSummary | null>(null);
  const [insights, setInsights] = useState<ResearchInsights | null>(null);

  useEffect(() => {
    api.getResearchSummary().then(setSummary).catch(() => {});
    api.getResearchInsights().then(setInsights).catch(() => {});
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Research</h1>
          <p className={styles.subtitle}>Coarse aggregates over this hospital&apos;s own patients</p>
        </div>
      </div>

      <div className={styles.grid}>
        <div className={styles.card}>
          <span className={styles.cardTitle}>Total Patients</span>
          <span className={styles.cardValue}>{summary?.total_patients ?? '—'}</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardTitle}>Average Age</span>
          <span className={styles.cardValue}>{summary ? Math.round(summary.age.average) : '—'}</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardTitle}>Min Group Size</span>
          <span className={styles.cardValue}>{summary?.min_group_size ?? '—'}</span>
        </div>
      </div>

      {insights && (
        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h2 style={{ fontSize: '1.2rem', color: 'var(--color-text-main)' }}>Observed Associations</h2>
          <p style={{ fontSize: '0.85rem', color: '#666' }}>{insights.note}</p>
          {insights.associations.map((a) => (
            <div key={a.diagnosis} className={styles.card}>
              <span className={styles.cardTitle}>{a.diagnosis}</span>
              <p style={{ fontSize: '0.9rem', color: 'var(--color-text-main)', marginTop: '0.5rem' }}>
                {a.patient_count} patients ·{' '}
                {a.common_symptoms.map((s) => `${s.symptom} (${s.count})`).join(', ') || 'no common symptoms'}
              </p>
            </div>
          ))}
          {insights.associations.length === 0 && (
            <p style={{ fontSize: '0.85rem', color: '#666' }}>No associations above the suppression threshold yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
