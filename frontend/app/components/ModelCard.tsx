import styles from './SharedCards.module.css';
import { api } from '../../lib/api';

export default async function ModelPage() {
  const modelInfo = await api.getModelInfo();
  const metrics = await api.getModelMetrics();

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Model Details</h1>
          <p className={styles.subtitle}>Version: {modelInfo.version} | Type: {modelInfo.type}</p>
        </div>
      </div>

      <div className={styles.grid}>
        <div className={styles.card}>
          <span className={styles.cardTitle}>Accuracy</span>
          <span className={styles.cardValue}>{(metrics.accuracy * 100).toFixed(1)}%</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardTitle}>Precision</span>
          <span className={styles.cardValue}>{(metrics.precision * 100).toFixed(1)}%</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardTitle}>Recall</span>
          <span className={styles.cardValue}>{(metrics.recall * 100).toFixed(1)}%</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardTitle}>F1 Score</span>
          <span className={styles.cardValue}>{(metrics.f1 * 100).toFixed(1)}%</span>
        </div>
      </div>
    </div>
  );
}
