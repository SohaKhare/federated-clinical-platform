"use client";
import { useEffect, useState } from 'react';
import styles from './SharedCards.module.css';
import { api, type PrivacyParameters } from '../../lib/api';

export default function PrivacyPage() {
  const [params, setParams] = useState<PrivacyParameters | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getPrivacyParameters()
      .then(setParams)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load privacy parameters'));
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Privacy Guard</h1>
          <p className={styles.subtitle}>
            Differential Privacy:{' '}
            {params ? (params.dp_enabled ? 'Enabled' : 'Not yet measured') : error ? 'Unavailable' : 'Loading…'}
          </p>
        </div>
      </div>

      <div className={styles.grid}>
        <div className={styles.card}>
          <span className={styles.cardTitle}>Epsilon</span>
          <span className={styles.cardValue}>{params?.epsilon ?? '—'}</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardTitle}>Delta</span>
          <span className={styles.cardValue}>{params?.delta ?? '—'}</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardTitle}>Clipping Norm</span>
          <span className={styles.cardValue}>{params?.clipping_norm ?? '—'}</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardTitle}>Noise Multiplier</span>
          <span className={styles.cardValue}>{params?.noise_multiplier ?? '—'}</span>
        </div>
      </div>

      {params && (
        <p style={{ marginTop: '1rem', fontSize: '0.85rem', color: '#666' }}>
          As of round {params.as_of_round ?? '—'} — reported from the latest confirmed federated exchange.
        </p>
      )}
    </div>
  );
}
