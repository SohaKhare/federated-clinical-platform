"use client";
import { useEffect, useState } from 'react';
import styles from './PlatformSummary.module.css';
import { Clock, Globe, Building2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/useAuth';

export default function PlatformSummary() {
  const { user } = useAuth();
  const isGlobal = user?.role === 'global';

  const [totalPrimary, setTotalPrimary] = useState<number | null>(null);
  const [totalExchanges, setTotalExchanges] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadData = () => {
      if (isGlobal) {
        api.getNodes()
          .then((nodes) => {
            if (!cancelled) setTotalPrimary(nodes.length);
          })
          .catch(() => {});
      } else {
        api.getResearchSummary()
          .then((s) => {
            if (!cancelled) setTotalPrimary(s.total_patients);
          })
          .catch(() => {});
      }

      api.getLogs({ pageSize: 1 })
        .then((data) => {
          if (!cancelled) setTotalExchanges(data.pagination.total);
        })
        .catch(() => {});
    };

    loadData();
    const interval = setInterval(loadData, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isGlobal]);

  return (
    <div className={styles.summaryContainer}>
      <div className={styles.titleSection}>
        <h1 className={styles.title}>
          {isGlobal ? 'Global Node Federation' : 'Platform Summary'}
        </h1>
      </div>

      <div className={styles.statsSection}>
        <div className={styles.statBox}>
          <div className={styles.iconCircle}>
            {isGlobal ? <Building2 size={16} /> : <Clock size={16} />}
          </div>
          <div className={styles.statContent}>
            <span className={styles.statLabel}>
              {isGlobal ? 'Participating Hospitals' : 'Total Patients'}
            </span>
            <div className={styles.statValueGroup}>
              <span className={styles.statValue}>{totalPrimary ?? '—'}</span>
              <span className={styles.statSub}>
                {isGlobal ? 'hospital nodes online' : 'patients registered'}
              </span>
            </div>
          </div>
        </div>

        <div className={styles.divider}></div>

        <div className={styles.statBox}>
          <div className={styles.iconCircle}>
            <Globe size={16} />
          </div>
          <div className={styles.statContent}>
            <span className={styles.statLabel}>
              {isGlobal ? 'Network Exchanges' : 'Federation Exchanges'}
            </span>
            <div className={styles.statValueGroup}>
              <span className={styles.statValue}>{totalExchanges ?? '—'}</span>
              <span className={styles.statSub}>
                {isGlobal ? 'global exchange events' : 'logged exchanges'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
