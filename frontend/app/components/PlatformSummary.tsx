"use client";
import { useEffect, useState } from 'react';
import styles from './PlatformSummary.module.css';
import { Clock, Globe } from 'lucide-react';
import { api } from '@/lib/api';

export default function PlatformSummary() {
  const [totalPatients, setTotalPatients] = useState<number | null>(null);
  const [recentLogs, setRecentLogs] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    api.getResearchSummary()
      .then((s) => {
        if (!cancelled) setTotalPatients(s.total_patients);
      })
      .catch(() => {});

    api.getLogs({ pageSize: 1 })
      .then((data) => {
        if (!cancelled) setRecentLogs(data.pagination.total);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={styles.summaryContainer}>
      <div className={styles.titleSection}>
        <h1 className={styles.title}>Platform Summary</h1>
      </div>

      <div className={styles.statsSection}>
        <div className={styles.statBox}>
          <div className={styles.iconCircle}>
            <Clock size={16} />
          </div>
          <div className={styles.statContent}>
            <span className={styles.statLabel}>Total Patients</span>
            <div className={styles.statValueGroup}>
              <span className={styles.statValue}>{totalPatients ?? '—'}</span>
              <span className={styles.statSub}>patients registered</span>
            </div>
          </div>
        </div>

        <div className={styles.divider}></div>

        <div className={styles.statBox}>
          <div className={styles.iconCircle}>
            <Globe size={16} />
          </div>
          <div className={styles.statContent}>
            <span className={styles.statLabel}>Federation Exchanges</span>
            <div className={styles.statValueGroup}>
              <span className={styles.statValue}>{recentLogs ?? '—'}</span>
              <span className={styles.statSub}>logged exchanges</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
