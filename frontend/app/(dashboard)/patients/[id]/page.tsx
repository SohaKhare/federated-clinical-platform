"use client";
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import styles from '../../../components/SharedCards.module.css';
import detailStyles from './detail.module.css';
import { api, type Patient, type PatientEvent } from '@/lib/api';

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

function formatEventData(data: Record<string, unknown>): string {
  const entries = Object.entries(data);
  if (entries.length === 0) return 'No details.';
  return entries
    .map(([key, value]) => {
      const display =
        Array.isArray(value) || (value !== null && typeof value === 'object')
          ? JSON.stringify(value)
          : String(value);
      return `${key}: ${display}`;
    })
    .join(' · ');
}

export default function PatientDetailsPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [patient, setPatient] = useState<Patient | null>(null);
  const [events, setEvents] = useState<PatientEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [eventType, setEventType] = useState('treatment');
  const [eventDetails, setEventDetails] = useState('');
  const [occurredAt, setOccurredAt] = useState('');
  const [addingEvent, setAddingEvent] = useState(false);
  const [eventError, setEventError] = useState('');

  const loadEvents = useCallback(async () => {
    setEvents(await api.getPatientEvents(id));
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const p = await api.getPatient(id);
        if (cancelled) return;
        setPatient(p);
        await loadEvents();
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
  }, [id, loadEvents]);

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setEventError('');

    if (!eventType.trim() || !eventDetails.trim()) {
      setEventError('Event type and details are required.');
      return;
    }

    setAddingEvent(true);
    try {
      await api.addPatientEvent(id, {
        eventType: eventType.trim(),
        eventData: { details: eventDetails.trim() },
        ...(occurredAt ? { occurredAt: new Date(occurredAt).toISOString() } : {}),
      });
      setEventDetails('');
      setOccurredAt('');
      await loadEvents();
    } catch (err) {
      setEventError(err instanceof Error ? err.message : 'Failed to add event');
    } finally {
      setAddingEvent(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <p>Loading patient…</p>
      </div>
    );
  }

  if (error || !patient) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Patient not found</h1>
            <p className={styles.subtitle}>{error || 'This patient does not exist.'}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{patient.name}</h1>
          <p className={styles.subtitle}>
            ID: #{patient.patient_id.split('-')[0]} | {patient.age} yrs |{' '}
            {patient.sex === 'F' ? 'Female' : 'Male'} | Added{' '}
            {formatDateTime(patient.created_at)}
          </p>
        </div>
      </div>

      <div className={styles.grid}>
        <div className={styles.card}>
          <span className={styles.cardTitle}>Diagnosed Diseases</span>
          <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {patient.diagnosed_diseases.length > 0 ? (
              patient.diagnosed_diseases.map((d, i) => (
                <span key={i} style={{ backgroundColor: '#f0f0f0', padding: '0.3rem 0.6rem', borderRadius: '12px', fontSize: '0.8rem' }}>{d}</span>
              ))
            ) : (
              <span style={{ fontSize: '0.85rem', color: '#666' }}>None recorded</span>
            )}
          </div>
        </div>

        <div className={styles.card}>
          <span className={styles.cardTitle}>Symptoms</span>
          <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {patient.symptoms.length > 0 ? (
              patient.symptoms.map((s, i) => (
                <span key={i} style={{ backgroundColor: '#f0f0f0', padding: '0.3rem 0.6rem', borderRadius: '12px', fontSize: '0.8rem' }}>{s}</span>
              ))
            ) : (
              <span style={{ fontSize: '0.85rem', color: '#666' }}>None recorded</span>
            )}
          </div>
        </div>

        <div className={styles.card}>
          <span className={styles.cardTitle}>Health Conditions</span>
          <div className={detailStyles.conditionsList}>
            {Object.entries(patient.health_conditions).map(([key, value]) => (
              <div key={key} className={detailStyles.conditionRow}>
                <span className={detailStyles.conditionKey}>{key}</span>
                <span>{Array.isArray(value) || typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
              </div>
            ))}
            {Object.keys(patient.health_conditions).length === 0 && (
              <span style={{ fontSize: '0.85rem', color: '#666' }}>None recorded</span>
            )}
          </div>
        </div>
      </div>

      <div style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>Clinical History</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {events.length === 0 && <p>No events recorded yet.</p>}
          {events.map((ev) => (
            <div key={ev.event_id} className={styles.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600 }}>{ev.event_type.replace(/_/g, ' ')}</span>
                <span style={{ fontSize: '0.8rem', color: '#666' }}>{formatDateTime(ev.occurred_at)}</span>
              </div>
              <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>{formatEventData(ev.event_data)}</p>
            </div>
          ))}
        </div>
      </div>

      <form onSubmit={handleAddEvent} style={{ marginTop: '2rem' }} className={detailStyles.eventForm}>
        <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>Add Event</h2>
        <div className={detailStyles.formRow}>
          <label className={detailStyles.field}>
            <span>Type</span>
            <select value={eventType} onChange={(e) => setEventType(e.target.value)}>
              <option value="treatment">treatment</option>
              <option value="diagnosis">diagnosis</option>
              <option value="observation">observation</option>
            </select>
          </label>
          <label className={detailStyles.field}>
            <span>Occurred at (optional)</span>
            <input
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
            />
          </label>
        </div>
        <label className={detailStyles.field}>
          <span>Details</span>
          <input
            type="text"
            value={eventDetails}
            onChange={(e) => setEventDetails(e.target.value)}
            placeholder="Treatment A — improving"
          />
        </label>
        {eventError && <p className={detailStyles.error}>{eventError}</p>}
        <button type="submit" disabled={addingEvent} className={detailStyles.submitBtn}>
          {addingEvent ? 'Adding…' : 'Add event'}
        </button>
      </form>
    </div>
  );
}
