import styles from './SharedCards.module.css';

export default function ModelPage() {
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
          <span className={styles.cardTitle}>Status</span>
          <span style={{ fontSize: '0.85rem', color: '#666' }}>
            No trained model version exists yet — federated training has not produced one.
          </span>
        </div>
      </div>
    </div>
  );
}
