import styles from './PlatformSummary.module.css';
import { Clock, Globe } from 'lucide-react';

export default function PlatformSummary() {
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
              <span className={styles.statValue}>1,204</span>
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
            <span className={styles.statLabel}>Recent Updates</span>
            <div className={styles.statValueGroup}>
              <span className={styles.statValue}>315</span>
              <span className={styles.statSub}>updates this month</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
