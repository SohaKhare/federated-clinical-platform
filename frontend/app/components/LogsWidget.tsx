"use client";
import styles from './LogsWidget.module.css';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { useRouter } from 'next/navigation';

const data = [
  { name: 'A', value: 10 },
  { name: 'B', value: 25 },
  { name: 'C', value: 15 },
  { name: 'D', value: 40 },
  { name: 'E', value: 20 },
  { name: 'F', value: 35 },
  { name: 'G', value: 15 },
  { name: 'H', value: 30 },
];

export default function LogsWidget() {
  const router = useRouter();

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>Logs</h3>
        <span className={styles.subtitle}>Data exchange history</span>
      </div>

      <div className={styles.chartBox} onClick={() => router.push('/logs')} style={{ cursor: 'pointer' }}>
        <div className={styles.chartHeader}>
          <div className={styles.badge}>More</div>
          <span className={styles.chartTitle}>Recent activity</span>
        </div>
        
        <div className={styles.chartContent}>
          <div className={styles.percentage}>
            23% <span className={styles.trend}>-</span>
          </div>
          <div className={styles.chartWrapper}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
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
              <AreaChart data={data}>
                <Area type="monotone" dataKey="value" stroke="#fff" fill="none" strokeWidth={1} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className={styles.darkContent}>
            <span className={styles.darkLabel}>Exchange speed</span>
            <div className={styles.badgePurp}>More</div>
            <div className={styles.darkPercentage}>
              17% <span className={styles.trend}>-</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
