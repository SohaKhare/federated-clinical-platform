import styles from './SharedCards.module.css';
import { api } from '../../lib/api';

export default async function PrivacyPage() {
  const status = await api.getPrivacyStatus();
  const budget = await api.getPrivacyBudget();

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Privacy Guard</h1>
          <p className={styles.subtitle}>Mode: {status.mode} | Active: {status.active ? 'Yes' : 'No'}</p>
        </div>
      </div>

      <div className={styles.grid}>
        <div className={styles.card}>
          <span className={styles.cardTitle}>Epsilon Budget</span>
          <span className={styles.cardValue}>{budget.epsilon}</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardTitle}>Budget Used</span>
          <span className={styles.cardValue}>{budget.used}</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardTitle}>Budget Remaining</span>
          <span className={styles.cardValue}>{budget.remaining}</span>
        </div>
      </div>
    </div>
  );
}
