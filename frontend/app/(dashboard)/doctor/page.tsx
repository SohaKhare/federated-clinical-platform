'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, type NewPatientInput, type Patient } from '@/lib/api';
import PresentationBatchButton from '../../components/PresentationBatchButton';
import styles from './doctor.module.css';

const emptyForm: NewPatientInput = {
  name: '', age: 45, sex: 'M', symptoms: [], diagnosed_diseases: [], health_conditions: {},
};

export default function DoctorPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [symptomsText, setSymptomsText] = useState('');
  const [prediction, setPrediction] = useState<{ prediction: boolean; probability: number } | null>(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const loadPatients = useCallback(async () => {
    try { setPatients(await api.getPatients()); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to load patients.'); }
  }, []);

  useEffect(() => { loadPatients(); }, [loadPatients]);

  function selectPatient(id: string) {
    const patient = patients.find((item) => item.patient_id === id);
    if (!patient) return;
    setSelectedId(id);
    setForm({
      name: patient.name, age: patient.age, sex: patient.sex,
      symptoms: patient.symptoms, diagnosed_diseases: patient.diagnosed_diseases,
      health_conditions: patient.health_conditions,
    });
    setSymptomsText(patient.symptoms.join(', '));
    setPrediction(null);
  }

  function readForm(): NewPatientInput {
    return { ...form, symptoms: symptomsText.split(',').map((item) => item.trim()).filter(Boolean) };
  }

  async function savePatient() {
    setSaving(true); setMessage('');
    try {
      const input = readForm();
      if (selectedId) await api.updatePatient(selectedId, input);
      else await api.createPatient(input);
      setMessage(selectedId ? 'Patient updated locally.' : 'Patient added to this hospital.');
      setSelectedId(''); setForm(emptyForm); setSymptomsText(''); await loadPatients();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to save patient.'); }
    finally { setSaving(false); }
  }

  async function runPrediction() {
    setSaving(true); setMessage('Running the local PyTorch model...');
    try {
      setPrediction(await api.predictPatient(readForm()));
      setMessage('Prediction completed locally.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to run prediction.'); }
    finally { setSaving(false); }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div><p className={styles.kicker}>LOCAL HOSPITAL NODE</p><h1>Doctor workspace</h1><p>Add, review, edit, and evaluate patients before the next federated round.</p></div>
        <PresentationBatchButton onAdded={loadPatients} />
      </header>

      {message && <p className={styles.message}>{message}</p>}
      <div className={styles.grid}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}><h2>{selectedId ? 'Edit patient' : 'Add patient'}</h2><span>Local only</span></div>
          <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Patient name" /></label>
          <div className={styles.twoCol}>
            <label>Age<input type="number" min="0" value={form.age} onChange={(e) => setForm({ ...form, age: Number(e.target.value) })} /></label>
            <label>Sex<select value={form.sex} onChange={(e) => setForm({ ...form, sex: e.target.value })}><option value="M">Male</option><option value="F">Female</option></select></label>
          </div>
          <label>Symptoms <small>comma separated</small><input value={symptomsText} onChange={(e) => setSymptomsText(e.target.value)} placeholder="chest pain, fatigue" /></label>
          <div className={styles.actions}><button className={styles.primary} onClick={savePatient} disabled={saving || !form.name.trim()}>{saving ? 'Saving...' : selectedId ? 'Save changes' : 'Add patient'}</button><button className={styles.secondary} onClick={runPrediction} disabled={saving}>Run prediction</button></div>
          {prediction && <div className={prediction.prediction ? styles.risk : styles.safe}><strong>{prediction.prediction ? 'Heart disease risk detected' : 'No heart disease risk detected'}</strong><span>Model probability: {(prediction.probability * 100).toFixed(1)}%</span></div>}
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}><h2>Select patient</h2><span>{patients.length} local records</span></div>
          <select className={styles.patientSelect} value={selectedId} onChange={(e) => selectPatient(e.target.value)}><option value="">Choose a patient to edit</option>{patients.map((patient) => <option key={patient.patient_id} value={patient.patient_id}>{patient.name} · {patient.age}</option>)}</select>
          <div className={styles.patientList}>{patients.slice(0, 8).map((patient) => <button key={patient.patient_id} onClick={() => selectPatient(patient.patient_id)} className={styles.patientRow}><span>{patient.name}</span><small>{patient.symptoms.join(', ') || 'No symptoms recorded'}</small></button>)}</div>
        </section>
      </div>
    </main>
  );
}
