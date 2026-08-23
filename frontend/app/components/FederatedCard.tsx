"use client";
import { useEffect, useState } from 'react';
import styles from './SharedCards.module.css';
import { api, type NodeStatus } from '../../lib/api';

export default function FederatedPage() {
  const [status, setStatus] = useState<NodeStatus | null>(null);

  useEffect(() => {
    api.getFederatedStatus().then(setStatus).catch(() => {});
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Federated Learning</h1>
          <p className={styles.subtitle}>Node status: {status?.status ?? '…'}</p>
        </div>
      </div>

      <div className={styles.grid}>
        <div className={styles.card}>
          <span className={styles.cardTitle}>Hospital</span>
          <span className={styles.cardValue}>{status?.hospital_name ?? '—'}</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardTitle}>Latest Round Seen</span>
          <span className={styles.cardValue}>{status?.federation_state.latest_round_seen ?? '—'}</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardTitle}>Last Direction</span>
          <span className={styles.cardValue}>{status?.federation_state.last_direction ?? '—'}</span>
        </div>
      </div>
    </div>
  );
}
