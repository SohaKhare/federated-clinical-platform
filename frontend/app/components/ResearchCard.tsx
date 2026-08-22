import styles from './SharedCards.module.css';
import { api } from '../../lib/api';

export default async function ResearchPage() {
  const summary = await api.getResearchSummary();
  const insights = await api.getResearchInsights();

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Research</h1>
          <p className={styles.subtitle}>Insights and Clinical Summaries</p>
        </div>
      </div>

      <div className={styles.grid}>
        <div className={styles.card}>
          <span className={styles.cardTitle}>Total Studies</span>
          <span className={styles.cardValue}>{summary.totalStudies}</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardTitle}>Active Trials</span>
          <span className={styles.cardValue}>{summary.activeTrials}</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardTitle}>Participants</span>
          <span className={styles.cardValue}>{summary.totalParticipants}</span>
        </div>
      </div>
      
      <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h2 style={{ fontSize: '1.2rem', color: 'var(--color-text-main)' }}>Key Insights</h2>
        {insights.map((insight, idx) => (
           <div key={idx} className={styles.card}>
             <span className={styles.cardTitle}>{insight.title}</span>
             <p style={{ fontSize: '0.9rem', color: 'var(--color-text-main)', marginTop: '0.5rem' }}>{insight.description}</p>
           </div>
        ))}
      </div>
    </div>
  );
}
