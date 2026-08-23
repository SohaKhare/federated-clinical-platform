"use client";
import { useEffect, useState } from 'react';
import styles from './SharedCards.module.css';
import { api, type LocalModelInfo, type LocalModelMetrics } from '../../lib/api';

const STATUS_LABELS: Record<LocalModelInfo['status'], string> = {
  untrained: 'Untrained',
  training: 'Training',
  ready: 'Ready',
  failed: 'Failed',
};

export default function ModelPage() {
  const [info, setInfo] = useState<LocalModelInfo | null>(null);
  const [metrics, setMetrics] = useState<LocalModelMetrics | null>(null);

  useEffect(() => {
    api.getModelInfo().then(setInfo).catch(() => {});
    api.getModelMetrics().then(setMetrics).catch(() => {});
  }, []);

  const formatPercent = (value: number | null) => value === null ? '—' : `${(value * 100).toFixed(1)}%`;
  const formatLoss = (value: number | null) => value === null ? '—' : value.toFixed(4);
  const formatDate = (value: string | null) => value === null ? '—' : new Date(value).toLocaleString();

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Model Details</h1>
          <p className={styles.subtitle}>Local model status: {info ? STATUS_LABELS[info.status] : '…'}</p>
        </div>
      </div>

      <div className={styles.grid}>
        <div className={styles.card}>
          <span className={styles.cardTitle}>Model Version</span>
          <span className={styles.cardValue}>{info?.model_version ?? '—'}</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardTitle}>Accuracy</span>
          <span className={styles.cardValue}>{formatPercent(metrics?.accuracy ?? null)}</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardTitle}>Eval Loss</span>
          <span className={styles.cardValue}>{formatLoss(metrics?.loss ?? null)}</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardTitle}>Latest Round</span>
          <span className={styles.cardValue}>{info?.latest_round ?? '—'}</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardTitle}>Training Samples</span>
          <span className={styles.cardValue}>{info?.sample_count ?? '—'}</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardTitle}>Last Trained</span>
          <span className={styles.cardValue}>{formatDate(info?.last_trained_at ?? null)}</span>
        </div>
      </div>
    </div>
  );
}
