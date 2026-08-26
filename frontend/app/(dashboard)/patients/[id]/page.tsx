"use client";
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import styles from '../../../components/SharedCards.module.css';
import detailStyles from './detail.module.css';
import { api, type Patient, type PatientEvent } from '@/lib/api';
import { useToast } from '@/lib/ToastContext';

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(formatValue).join(', ');
  if (value !== null && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${formatValue(v)}`)
      .join(', ');
  }
  return String(value);
}

function formatEventData(data: Record<string, unknown>): string {
  const entries = Object.entries(data);
  if (entries.length === 0) return 'No details.';
  return entries.map(([key, value]) => `${key}: ${formatValue(value)}`).join(' · ');
}

const CLINICAL_SNAPSHOT_EVENT_TYPES = new Set(['patient_created', 'patient_updated']);

function EventDataView({ ev }: { ev: PatientEvent }) {
  if (CLINICAL_SNAPSHOT_EVENT_TYPES.has(ev.event_type)) {
    const data = ev.event_data as {
      symptoms?: unknown;
      diagnosed_diseases?: unknown;
      health_conditions?: unknown;
    };
    const symptoms = Array.isArray(data.symptoms) ? (data.symptoms as string[]) : [];
    const diagnosedDiseases = Array.isArray(data.diagnosed_diseases)
      ? (data.diagnosed_diseases as string[])
      : [];
    const healthConditions =
      data.health_conditions && typeof data.health_conditions === 'object' && !Array.isArray(data.health_conditions)
        ? (data.health_conditions as Record<string, unknown>)
        : {};
    const conditionEntries = Object.entries(healthConditions);

    if (symptoms.length === 0 && diagnosedDiseases.length === 0 && conditionEntries.length === 0) {
      return <p style={{ fontSize: '0.9rem', marginTop: '0.5rem', color: '#666' }}>No clinical details.</p>;
    }

    return (
      <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {symptoms.length > 0 && (
          <div>
            <span style={{ fontSize: '0.75rem', color: '#666' }}>Symptoms</span>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
              {symptoms.map((s, i) => (
                <span
                  key={i}
                  style={{ backgroundColor: '#f0f0f0', padding: '0.2rem 0.55rem', borderRadius: '10px', fontSize: '0.78rem' }}
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}
        {diagnosedDiseases.length > 0 && (
          <div>
            <span style={{ fontSize: '0.75rem', color: '#666' }}>Diagnosed Diseases</span>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
              {diagnosedDiseases.map((d, i) => (
                <span
                  key={i}
                  style={{ backgroundColor: '#f0f0f0', padding: '0.2rem 0.55rem', borderRadius: '10px', fontSize: '0.78rem' }}
                >
                  {d}
                </span>
              ))}
            </div>
          </div>
        )}
        {conditionEntries.length > 0 && (
          <div>
            <span style={{ fontSize: '0.75rem', color: '#666' }}>Health Conditions</span>
            <div className={detailStyles.conditionsList} style={{ marginTop: '0.25rem' }}>
              {conditionEntries.map(([key, value]) => (
                <div key={key} className={detailStyles.conditionRow}>
                  <span className={detailStyles.conditionKey}>{key}</span>
                  <span>{formatValue(value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>{formatEventData(ev.event_data)}</p>;
}

export default function PatientDetailsPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { success, error: toastError } = useToast();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [events, setEvents] = useState<PatientEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [newSymptom, setNewSymptom] = useState('');
  const [diagnosedDiseases, setDiagnosedDiseases] = useState<string[]>([]);
  const [newDisease, setNewDisease] = useState('');
  const [conditionRows, setConditionRows] = useState<{ key: string; value: string }[]>([]);
  const [newConditionKey, setNewConditionKey] = useState('');
  const [newConditionValue, setNewConditionValue] = useState('');
  const [savingClinicalInfo, setSavingClinicalInfo] = useState(false);
  const [clinicalInfoError, setClinicalInfoError] = useState('');

  const loadEvents = useCallback(async () => {
    setEvents(await api.getPatientEvents(id));
  }, [id]);

  const syncClinicalFormFromPatient = useCallback((p: Patient) => {
    setSymptoms(p.symptoms);
    setDiagnosedDiseases(p.diagnosed_diseases);
    setConditionRows(
      Object.entries(p.health_conditions).map(([key, value]) => ({
        key,
        value:
          Array.isArray(value) || (value !== null && typeof value === 'object')
            ? JSON.stringify(value)
            : String(value),
      })),
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const p = await api.getPatient(id);
        if (cancelled) return;
        setPatient(p);
        syncClinicalFormFromPatient(p);
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
  }, [id, loadEvents, syncClinicalFormFromPatient]);

  const addSymptom = () => {
    const value = newSymptom.trim();
    if (!value || symptoms.includes(value)) return;
    setSymptoms((prev) => [...prev, value]);
    setNewSymptom('');
  };

  const addDisease = () => {
    const value = newDisease.trim();
    if (!value || diagnosedDiseases.includes(value)) return;
    setDiagnosedDiseases((prev) => [...prev, value]);
    setNewDisease('');
  };

  const addConditionRow = () => {
    const key = newConditionKey.trim();
    if (!key) return;
    setConditionRows((prev) => [...prev, { key, value: newConditionValue.trim() }]);
    setNewConditionKey('');
    setNewConditionValue('');
  };

  const handleUpdateClinicalInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    setClinicalInfoError('');

    // Pick up anything still sitting in the "add new" inputs so Save
    // doesn't silently drop it just because Add wasn't clicked first.
    const pendingSymptom = newSymptom.trim();
    const finalSymptoms =
      pendingSymptom && !symptoms.includes(pendingSymptom)
        ? [...symptoms, pendingSymptom]
        : symptoms;

    const pendingDisease = newDisease.trim();
    const finalDiseases =
      pendingDisease && !diagnosedDiseases.includes(pendingDisease)
        ? [...diagnosedDiseases, pendingDisease]
        : diagnosedDiseases;

    const pendingConditionKey = newConditionKey.trim();
    const finalConditionRows = pendingConditionKey
      ? [...conditionRows, { key: pendingConditionKey, value: newConditionValue.trim() }]
      : conditionRows;

    const health_conditions: Record<string, unknown> = {};
    for (const row of finalConditionRows) {
      if (!row.key.trim()) continue;
      try {
        health_conditions[row.key.trim()] = JSON.parse(row.value);
      } catch {
        health_conditions[row.key.trim()] = row.value;
      }
    }

    setSavingClinicalInfo(true);
    try {
      const updated = await api.updatePatient(id, {
        symptoms: finalSymptoms,
        diagnosed_diseases: finalDiseases,
        health_conditions,
      });
      setPatient(updated);
      syncClinicalFormFromPatient(updated);
      setNewSymptom('');
      setNewDisease('');
      setNewConditionKey('');
      setNewConditionValue('');
      success('Clinical info updated successfully!');
      await loadEvents();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update clinical info';
      setClinicalInfoError(msg);
      toastError(msg);
    } finally {
      setSavingClinicalInfo(false);
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

      <form onSubmit={handleUpdateClinicalInfo} style={{ marginTop: '2rem' }} className={detailStyles.eventForm}>
        <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>Update Clinical Info</h2>

        <label className={detailStyles.field}>
          <span>Symptoms</span>
          <div className={detailStyles.chipList}>
            {symptoms.map((s, i) => (
              <span key={s} className={detailStyles.chip}>
                {s}
                <button
                  type="button"
                  className={detailStyles.chipRemove}
                  onClick={() => setSymptoms((prev) => prev.filter((_, idx) => idx !== i))}
                  aria-label={`Remove ${s}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className={detailStyles.chipAddRow}>
            <input
              type="text"
              value={newSymptom}
              onChange={(e) => setNewSymptom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addSymptom();
                }
              }}
              placeholder="Add a symptom"
            />
            <button type="button" className={detailStyles.chipAddBtn} onClick={addSymptom}>
              Add
            </button>
          </div>
        </label>

        <label className={detailStyles.field}>
          <span>Diagnosed Diseases</span>
          <div className={detailStyles.chipList}>
            {diagnosedDiseases.map((d, i) => (
              <span key={d} className={detailStyles.chip}>
                {d}
                <button
                  type="button"
                  className={detailStyles.chipRemove}
                  onClick={() => setDiagnosedDiseases((prev) => prev.filter((_, idx) => idx !== i))}
                  aria-label={`Remove ${d}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className={detailStyles.chipAddRow}>
            <input
              type="text"
              value={newDisease}
              onChange={(e) => setNewDisease(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addDisease();
                }
              }}
              placeholder="Add a diagnosed disease (e.g. ICD10_J45)"
            />
            <button type="button" className={detailStyles.chipAddBtn} onClick={addDisease}>
              Add
            </button>
          </div>
        </label>

        <label className={detailStyles.field}>
          <span>Health Conditions</span>
          <div className={detailStyles.conditionsList}>
            {conditionRows.map((row, i) => (
              <div key={i} className={detailStyles.conditionEditRow}>
                <input
                  type="text"
                  value={row.key}
                  onChange={(e) =>
                    setConditionRows((prev) =>
                      prev.map((r, idx) => (idx === i ? { ...r, key: e.target.value } : r)),
                    )
                  }
                  placeholder="key (e.g. bp)"
                />
                <input
                  type="text"
                  value={row.value}
                  onChange={(e) =>
                    setConditionRows((prev) =>
                      prev.map((r, idx) => (idx === i ? { ...r, value: e.target.value } : r)),
                    )
                  }
                  placeholder="value (e.g. 128/82)"
                />
                <button
                  type="button"
                  className={detailStyles.chipRemove}
                  onClick={() => setConditionRows((prev) => prev.filter((_, idx) => idx !== i))}
                  aria-label={`Remove ${row.key}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <div className={detailStyles.chipAddRow}>
            <input
              type="text"
              value={newConditionKey}
              onChange={(e) => setNewConditionKey(e.target.value)}
              placeholder="key (e.g. allergies)"
            />
            <input
              type="text"
              value={newConditionValue}
              onChange={(e) => setNewConditionValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addConditionRow();
                }
              }}
              placeholder='value (e.g. ["penicillin"])'
            />
            <button type="button" className={detailStyles.chipAddBtn} onClick={addConditionRow}>
              Add
            </button>
          </div>
        </label>

        {clinicalInfoError && <p className={detailStyles.error}>{clinicalInfoError}</p>}
        <button type="submit" disabled={savingClinicalInfo} className={detailStyles.submitBtn}>
          {savingClinicalInfo ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    </div>
  );
}
