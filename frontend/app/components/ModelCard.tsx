import styles from './SharedCards.module.css';

export default async function ModelPage() {
  const modelInfo = await api.getModelInfo();
  const metrics = await api.getModelMetrics();
  const formatMetric = (value: number | null) => value === null ? '—' : `${(value * 100).toFixed(1)}%`;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Model Details</h1>
          <p className={styles.subtitle}>Model status and metrics APIs are not yet available.</p>
        </div>
      </div>

      <div className={styles.grid}>
        <div className={styles.card}>
          <span className={styles.cardTitle}>Accuracy</span>
          <span className={styles.cardValue}>{formatMetric(metrics.accuracy)}</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardTitle}>Precision</span>
          <span className={styles.cardValue}>{formatMetric(metrics.precision)}</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardTitle}>Recall</span>
          <span className={styles.cardValue}>{formatMetric(metrics.recall)}</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardTitle}>F1 Score</span>
          <span className={styles.cardValue}>{formatMetric(metrics.f1)}</span>
        </div>
      </div>
    </div>
  );
}
