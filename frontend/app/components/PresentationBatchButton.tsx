'use client';

import { useState } from 'react';
import { api } from '../../lib/api';
import styles from './PresentationBatchButton.module.css';

export default function PresentationBatchButton({ onAdded }: { onAdded?: () => void }) {
  const [status, setStatus] = useState('');
  const [addedCount, setAddedCount] = useState(0);
  const [loading, setLoading] = useState(false);

  async function addDailyBatch() {
    setLoading(true);
    setStatus('Loading held-out patients...');
    try {
      const today = new Date().toISOString().slice(0, 10);
      const key = `presentation-patients-${today}`;
      if (localStorage.getItem(key)) {
        setStatus("Today's presentation batch is already loaded.");
        return;
      }
      const batch = await api.getPresentationBatch() as { hospital_id: number; patients: unknown[] };
      localStorage.setItem(key, 'loaded');
      setAddedCount(batch.patients.length);
      onAdded?.();
      setStatus(`${batch.patients.length} real held-out patients added for Hospital ${batch.hospital_id}.`);
    } catch (error) {
      console.error('Presentation batch error:', error);
      setStatus('Could not load the presentation pool.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <button className={styles.button} onClick={addDailyBatch} disabled={loading}>
        {loading ? 'Adding...' : "Add today's 10–20 patients"}
      </button>
      {status && <span className={styles.status}>{status}</span>}
      {addedCount > 0 && <span className={styles.count}>Local evaluation rows: {addedCount}</span>}
    </div>
  );
}
