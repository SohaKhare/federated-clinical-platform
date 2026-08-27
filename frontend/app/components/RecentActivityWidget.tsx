"use client";
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from './RecentActivityWidget.module.css';
import { CheckCircle2, ArrowDownToLine, FileCheck, Radio } from 'lucide-react';
import { api, type LogEntry } from '@/lib/api';
import { parseUtcIso } from '@/lib/time';

export default function RecentActivityWidget() {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.getLogs({ pageSize: 5 })
      .then((res) => {
        if (!cancelled) setLogs(res.logs);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const defaultActivities = [
    {
      id: '1',
      title: 'Round 6 completed successfully',
      time: '10:09 AM',
      subtitle: 'Global model updated and evaluated',
      icon: <CheckCircle2 size={15} />,
      type: 'green',
    },
    {
      id: '2',
      title: 'Model update received from AIIMS Delhi',
      time: '10:07 AM',
      subtitle: 'Weights encrypted and aggregated',
      icon: <ArrowDownToLine size={15} />,
      type: 'teal',
    },
    {
      id: '3',
      title: 'Data quality report from KKS Hospital',
      time: '10:05 AM',
      subtitle: '98.5% quality score • No issues found',
      icon: <FileCheck size={15} />,
      type: 'blue',
    },
    {
      id: '4',
      title: 'Round 7 initialized',
      time: '10:03 AM',
      subtitle: 'Broadcasted to all participating hospitals',
      icon: <Radio size={15} />,
      type: 'green',
    },
  ];

  // If live logs exist, format the most recent ones, otherwise fallback to defaults
  const displayActivities = logs.length > 0
    ? logs.slice(0, 4).map((l, idx) => {
        const timeStr = parseUtcIso(l.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
        let title = `Round ${l.round} update`;
        let subtitle = l.direction === 'outgoing' ? 'Encrypted weights submitted' : 'Global model received';
        let icon = <CheckCircle2 size={15} />;
        let type = 'green';

        if (l.status === 'confirmed' || l.status === 'synced') {
          title = `Round ${l.round} completed successfully`;
          subtitle = 'Global model updated and evaluated';
          icon = <CheckCircle2 size={15} />;
          type = 'green';
        } else if (l.direction === 'incoming') {
          title = `Model update received from Node ${l.node_id ? `#${l.node_id.slice(0, 6)}` : 'Hospital'}`;
          subtitle = 'Weights encrypted and aggregated';
          icon = <ArrowDownToLine size={15} />;
          type = 'teal';
        } else {
          title = `Round ${l.round} broadcast`;
          subtitle = 'Broadcasted to all participating hospitals';
          icon = <Radio size={15} />;
          type = 'green';
        }

        return {
          id: l.log_id || String(idx),
          title,
          time: timeStr,
          subtitle,
          icon,
          type,
        };
      })
    : defaultActivities;

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <h3 className={styles.title}>Recent Activity</h3>
        <Link href="/logs" className={styles.viewAllLink}>
          View all logs
        </Link>
      </div>

      <div className={styles.activityList}>
        {displayActivities.map((act) => {
          let iconClass = styles.iconGreen;
          if (act.type === 'teal') iconClass = styles.iconTeal;
          if (act.type === 'blue') iconClass = styles.iconBlue;

          return (
            <div key={act.id} className={styles.activityItem}>
              <div className={`${styles.iconWrapper} ${iconClass}`}>
                {act.icon}
              </div>
              <div className={styles.activityContent}>
                <div className={styles.rowTop}>
                  <span className={styles.itemTitle}>{act.title}</span>
                  <span className={styles.itemTime}>{act.time}</span>
                </div>
                <div className={styles.itemSubtitle}>{act.subtitle}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
