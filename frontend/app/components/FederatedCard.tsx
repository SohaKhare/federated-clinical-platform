import styles from './SharedCards.module.css';
import { api } from '../../lib/api';

export default async function FederatedPage() {
  const status = await api.getFederatedStatus();
  const round = await api.getFederatedRound();

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Federated Learning</h1>
          <p className={styles.subtitle}>Status: {status.status} | Uptime: {status.uptime}</p>
        </div>
      </div>

      <div className={styles.grid}>
        <div className={styles.card}>
          <span className={styles.cardTitle}>Connected Nodes</span>
          <span className={styles.cardValue}>{status.connectedNodes}</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardTitle}>Current Round</span>
          <span className={styles.cardValue}>{round.currentRound} / {round.totalRounds}</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardTitle}>Round Progress</span>
          <span className={styles.cardValue}>{(round.progress * 100).toFixed(0)}%</span>
        </div>
      </div>
    </div>
  );
}
