import styles from '../../shared.module.css';
import { api } from '../../../../lib/api';

export default async function PatientDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const patient = await api.getPatientDetails(resolvedParams.id);
  const events = await api.getPatientEvents(resolvedParams.id);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{patient.name}</h1>
          <p className={styles.subtitle}>ID: #{patient.id} | DOB: {patient.dob}</p>
        </div>
      </div>

      <div className={styles.grid}>
        <div className={styles.card}>
          <span className={styles.cardTitle}>Conditions</span>
          <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
            {patient.conditions.map((c, i) => (
              <span key={i} style={{ backgroundColor: '#f0f0f0', padding: '0.3rem 0.6rem', borderRadius: '12px', fontSize: '0.8rem' }}>{c}</span>
            ))}
          </div>
        </div>
      </div>
      
      <div style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>Patient Events</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {events.map((e, idx) => (
            <div key={idx} className={styles.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                 <span style={{ fontWeight: 600 }}>{e.type}</span>
                 <span style={{ fontSize: '0.8rem', color: '#666' }}>{e.date}</span>
              </div>
              <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>{e.details}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
