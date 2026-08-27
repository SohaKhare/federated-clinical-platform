'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError, type PatientPrediction, type Patient } from '@/lib/api';
import { useToast } from '@/lib/ToastContext';
import RiskCard from '../../../../components/RiskCard';
import MobileBackButton from '../../../../components/MobileBackButton';
import styles from '../../../../components/SharedCards.module.css';

export default function PatientPredictionPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { error: toastError } = useToast();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [prediction, setPrediction] = useState<PatientPrediction | null>(null);
  const [loading, setLoading] = useState(true);
  const [rerunning, setRerunning] = useState(false);
  const [error, setError] = useState('');

  const runPrediction = useCallback(async () => {
    setError('');
    try {
      setPrediction(await api.predictPatientById(id));
    } catch (e) {
      const msg =
        e instanceof ApiError && e.status === 502
          ? 'The local model is unavailable. Make sure a model has been trained for this node.'
          : e instanceof Error
            ? e.message
            : 'Failed to run prediction';
      setError(msg);
      toastError(msg);
    }
  }, [id, toastError]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [p] = await Promise.all([api.getPatient(id), runPrediction()]);
        if (!cancelled) setPatient(p);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load patient');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id, runPrediction]);

  const rerun = async () => {
    setRerunning(true);
    await runPrediction();
    setRerunning(false);
  };

  return (
    <div className={styles.container}>
      <MobileBackButton label="Back to Patients" />
      <div className={styles.header}>
        <div>
          <p className={styles.subtitle} style={{ marginBottom: '0.35rem' }}>
            <Link href={`/patients/${id}`} style={{ color: '#245d55', textDecoration: 'none' }}>
              ← Back to patient
            </Link>
          </p>
          <h1 className={styles.title}>{patient ? patient.name : 'Patient'}</h1>
          {patient && (
            <p className={styles.subtitle}>
              ID: #{patient.patient_id.split('-')[0]} | {patient.age} yrs |{' '}
              {patient.sex === 'F' ? 'Female' : 'Male'}
            </p>
          )}
        </div>
      </div>

      {loading && <p>Running the federated model…</p>}

      {!loading && error && !prediction && (
        <div className={styles.card}>
          <span className={styles.cardTitle}>Risk assessment unavailable</span>
          <p style={{ color: '#a34237' }}>{error}</p>
          <button
            onClick={rerun}
            disabled={rerunning}
            style={{
              alignSelf: 'flex-start',
              marginTop: '0.5rem',
              border: '1px solid #dce8e5',
              background: '#fff',
              color: '#245d55',
              fontWeight: 600,
              padding: '0.5rem 0.9rem',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            {rerunning ? 'Retrying…' : 'Retry'}
          </button>
        </div>
      )}

      {!loading && prediction && (
        <RiskCard prediction={prediction} onRerun={rerun} rerunning={rerunning} />
      )}
    </div>
  );
}
