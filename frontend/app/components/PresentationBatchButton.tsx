'use client';

import { useState } from 'react';
import { api } from '../../lib/api';
import { useToast } from '../../lib/ToastContext';
import styles from './PresentationBatchButton.module.css';

export default function PresentationBatchButton({ onAdded }: { onAdded?: () => void }) {
  const [status, setStatus] = useState('');
  const [addedCount, setAddedCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const { success, error: toastError } = useToast();

  async function addDailyBatch() {
    setLoading(true);
    setStatus('Loading held-out patients...');
    try {
      const batch = await api.getPresentationBatch() as { hospital_id: number; patients: unknown[] };
      setAddedCount(batch.patients.length);
      onAdded?.();
      const msg = `${batch.patients.length} held-out patients successfully added for Hospital ${batch.hospital_id}!`;
      setStatus(msg);
      success(msg);
    } catch (error) {
      console.error('Presentation batch error:', error);
      const errMsg = 'Could not load the presentation pool.';
      setStatus(errMsg);
      toastError(errMsg);
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
