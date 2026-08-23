"use client";
import { useEffect, useState, useCallback } from 'react';
import styles from './LogsWidget.module.css';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { useRouter } from 'next/navigation';
import { api, type LogEntry } from '@/lib/api';

export default function LogsWidget() {
  const router = useRouter();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [confirmedPct, setConfirmedPct] = useState<number | null>(null);

  const fetchLogs = useCallback(() => {
    api.getLogs({ pageSize: 50 })
      .then((data) => {
        setLogs(data.logs);
        const total = data.pagination.total;
        const confirmed = data.logs.filter((l) => l.status === 'confirmed' || l.status === 'synced' || l.status === 'applied').length;
        setConfirmedPct(total > 0 ? Math.round((confirmed / total) * 100) : 0);
      })
      .catch(() => {
        setConfirmedPct(0);
      });
  }, []);

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  const chartData = logs.length > 0
    ? [...logs]
        .reverse()
        .map((l) => ({
          name: `R${l.round}`,
          value: l.status === 'failed' ? 5 : l.direction === 'outgoing' ? 25 : 18
        }))
    : [
        { name: 'R1', value: 12 },
        { name: 'R2', value: 18 },
        { name: 'R3', value: 24 }
      ];

  const latestRound = logs.length > 0 ? Math.max(...logs.map((l) => l.round)) : null;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>Logs</h3>
        <span className={styles.subtitle}>Data exchange history</span>
      </div>

      <div className={styles.chartBox} onClick={() => router.push('/logs')} style={{ cursor: 'pointer' }}>
        <div className={styles.chartHeader}>
          <div className={styles.badge}>Live</div>
          <span className={styles.chartTitle}>Recent activity</span>
        </div>

        <div className={styles.chartContent}>
          <div className={styles.percentage}>
            {confirmedPct === null ? '…' : `${confirmedPct}%`} <span className={styles.trend}>confirmed</span>
          </div>
          <div className={styles.chartWrapper}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <Area type="monotone" dataKey="value" stroke="#333" fill="#e0e0e0" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className={styles.darkBox} onClick={() => router.push('/logs')} style={{ cursor: 'pointer' }}>
        <div className={styles.darkHeader}>
          <div className={styles.darkChart}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <Area type="monotone" dataKey="value" stroke="#fff" fill="none" strokeWidth={1} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className={styles.darkContent}>
            <span className={styles.darkLabel}>Exchanges logged</span>
            <div className={styles.badgePurp}>{logs.length} logged</div>
            <div className={styles.darkPercentage}>
              {latestRound !== null ? `R${latestRound}` : '—'} <span className={styles.trend}>latest round</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
