import styles from './SharedCards.module.css';

export default function AuditPage() {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Audit Logs</h1>
          <p className={styles.subtitle}>System and user action tracking</p>
        </div>
      </div>

      <div className={styles.grid} style={{ gridTemplateColumns: '1fr' }}>
        <div className={styles.card}>
          <span className={styles.cardTitle}>Goal Executions</span>
          <p style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#666' }}>
            No recent goals triggered via /goal command.
          </p>
        </div>
        <div className={styles.card}>
          <span className={styles.cardTitle}>Recent Actions</span>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
            <tbody>
               <tr>
                 <td style={{ padding: '0.5rem 0', borderBottom: '1px solid #f0f0f0', fontSize: '0.85rem' }}>2026-08-22 12:15:00</td>
                 <td style={{ padding: '0.5rem 0', borderBottom: '1px solid #f0f0f0', fontSize: '0.85rem' }}>User logged in</td>
               </tr>
               <tr>
                 <td style={{ padding: '0.5rem 0', borderBottom: '1px solid #f0f0f0', fontSize: '0.85rem' }}>2026-08-22 12:16:30</td>
                 <td style={{ padding: '0.5rem 0', borderBottom: '1px solid #f0f0f0', fontSize: '0.85rem' }}>Model federated round completed</td>
               </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
