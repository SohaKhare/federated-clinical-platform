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

  async function addFutureBatch() {
    setLoading(true);
    setStatus('Loading unseen patients...');
    try {
      const batch = await api.addFutureBatch();
      setAddedCount(batch.added);
      onAdded?.();
      const msg = `${batch.added} new patients added with XGBoost predictions!`;
      setStatus(msg);
      success(msg);
    } catch (error) {
      console.error('Future batch error:', error);
      const errMsg = 'Could not load the future patient pool.';
      setStatus(errMsg);
      toastError(errMsg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <button className={styles.button} onClick={addFutureBatch} disabled={loading}>
        {loading ? 'Adding...' : 'Add 10–20 Patients'}
      </button>
      {status && <span className={styles.status}>{status}</span>}
      {addedCount > 0 && <span className={styles.count}>Unseen rows inserted: {addedCount}</span>}
    </div>
  );
}