"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from './PatientManagement.module.css';
import formStyles from './PatientFormModal.module.css';
import { Camera, Plus, ChevronRight, X } from 'lucide-react';
import { api, ApiError, type Patient } from '@/lib/api';

export default function PatientManagement() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const loadPatients = () => {
    api.getPatients()
      .then(setPatients)
      .catch(() => {});
  };

  useEffect(() => {
    loadPatients();
  }, []);

  const recent = patients.slice(0, 4);

  return (
    <div className={styles.container}>

      {/* Edit Patient Card */}
      <div className={styles.addPatientCard} onClick={() => setShowForm(true)} style={{ cursor: 'pointer' }}>
        <div className={styles.cameraIcon}>
          <Camera size={16} color="#666" />
        </div>

        <div className={styles.faceWireframe}>
          <div className={styles.headOutline}></div>
          <div className={styles.crosshair}></div>
        </div>

        <div className={styles.addContent}>
          <h4 className={styles.addTitle}>Edit patients</h4>
          <span className={styles.addSubtitle}>Manage and update local records</span>
        </div>
      </div>


      {/* Patient List */}
      <div className={styles.listSection}>
        <h4 className={styles.listTitle}>Patients <span>{patients.length} registered</span></h4>

        <div className={styles.listItems}>
          {recent.length === 0 && (
            <div className={styles.listItem}>
              <span className={styles.itemName}>No patients yet</span>
            </div>
          )}
          {recent.map((p) => (
            <Link key={p.patient_id} href={`/patients/${p.patient_id}`} style={{ textDecoration: 'none' }}>
              <div className={styles.listItem}>
                <span className={styles.itemName}>{p.name}</span>
                <div className={styles.itemControls}>
                  <div className={styles.dotsGroup}>
                    <span className={(p.diagnosed_diseases?.length ?? 0) > 0 ? styles.dotGreen : styles.dotLight}></span>
                    <span className={styles.dotLight}></span>
                    <span className={styles.dotLight}></span>
                  </div>
                  <ChevronRight size={14} color="#666" />
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className={styles.listFooter}>
          <Link href="/patients" className={styles.viewAllBtn}>view all <ChevronRight size={12} /></Link>
          <div className={styles.addBtn} onClick={() => setShowForm(true)}>edit <Plus size={12} /></div>
        </div>
      </div>

      {/* Expand card (static) */}
      <div className={styles.expandCard}>
        <div className={styles.expandHeader}>
          <div className={styles.progressValue}>{patients.length}</div>
          <span className={styles.progressSub}>local patients</span>
        </div>
        <div className={styles.progressBar}>
          <div className={styles.progressFill}></div>
          <div className={styles.progressDot}></div>
          <div className={styles.progressTrackDots}></div>
        </div>
        <div className={styles.expandContent}>
          <h5 className={styles.expandTitle}>Manage your node</h5>
          <p className={styles.expandDesc}>Edit and update patient records for federated rounds</p>
          <Link href="/patients" className={styles.viewAllBtn}>All patients <ChevronRight size={12} /></Link>
        </div>
        <div className={styles.plusIconLarge} onClick={() => setShowForm(true)}>
          <Plus size={16} color="#fff" />
        </div>
      </div>

      {/* Add Patient Modal */}
      {showForm && (
        <AddPatientModal
          submitting={submitting}
          error={formError}
          onClose={() => setShowForm(false)}
          onSubmit={async (input) => {
            setSubmitting(true);
            setFormError('');
            try {
              await api.createPatient(input);
              setShowForm(false);
              loadPatients();
            } catch (err) {
              setFormError(err instanceof ApiError ? err.message : 'Failed to create patient.');
            } finally {
              setSubmitting(false);
            }
          }}
        />
      )}
    </div>
  );
}

interface AddPatientInput {
  name: string;
  age: number;
  sex: string;
  symptoms: string[];
  diagnosed_diseases: string[];
  health_conditions: Record<string, unknown>;
}

function AddPatientModal({
  onSubmit,
  onClose,
  submitting,
  error,
}: {
  onSubmit: (input: AddPatientInput) => void;
  onClose: () => void;
  submitting: boolean;
  error: string;
}) {
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState('F');
  const [symptoms, setSymptoms] = useState('');
  const [diseases, setDiseases] = useState('');
  const [bp, setBp] = useState('');
  const [sugar, setSugar] = useState('');
  const [allergies, setAllergies] = useState('');

  const splitList = (value: string) =>
    value.split(',').map((v) => v.trim()).filter(Boolean);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !age.trim()) return;

    const healthConditions: Record<string, unknown> = {};
    if (bp.trim()) healthConditions.bp = bp.trim();
    if (sugar.trim()) healthConditions.sugar = sugar.trim();
    if (allergies.trim()) healthConditions.allergies = splitList(allergies);

    onSubmit({
      name: name.trim(),
      age: Number(age),
      sex,
      symptoms: splitList(symptoms),
      diagnosed_diseases: splitList(diseases),
      health_conditions: healthConditions,
    });
  };

  return (
    <div className={formStyles.overlay} onClick={onClose}>
      <div className={formStyles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={formStyles.header}>
          <h3>Edit Patient</h3>
          <button type="button" className={formStyles.closeBtn} onClick={onClose}><X size={16} /></button>
        </div>

        <form className={formStyles.form} onSubmit={handleSubmit}>
          <div className={formStyles.row}>
            <label className={formStyles.field}>
              <span>Name *</span>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Rekha Sharma" />
            </label>
            <label className={formStyles.field}>
              <span>Age *</span>
              <input type="number" min="0" max="120" value={age} onChange={(e) => setAge(e.target.value)} placeholder="34" />
            </label>
            <label className={formStyles.field}>
              <span>Sex *</span>
              <select value={sex} onChange={(e) => setSex(e.target.value)}>
                <option value="F">F</option>
                <option value="M">M</option>
              </select>
            </label>
          </div>

          <label className={formStyles.field}>
            <span>Symptoms (comma separated)</span>
            <input type="text" value={symptoms} onChange={(e) => setSymptoms(e.target.value)} placeholder="fever, cough, fatigue" />
          </label>

          <label className={formStyles.field}>
            <span>Diagnosed diseases (comma separated)</span>
            <input type="text" value={diseases} onChange={(e) => setDiseases(e.target.value)} placeholder="ICD10_J45" />
          </label>

          <div className={formStyles.row}>
            <label className={formStyles.field}>
              <span>Blood pressure</span>
              <input type="text" value={bp} onChange={(e) => setBp(e.target.value)} placeholder="130/85" />
            </label>
            <label className={formStyles.field}>
              <span>Sugar</span>
              <input type="text" value={sugar} onChange={(e) => setSugar(e.target.value)} placeholder="110mg/dL" />
            </label>
            <label className={formStyles.field}>
              <span>Allergies (comma separated)</span>
              <input type="text" value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="penicillin" />
            </label>
          </div>

          {error && <p className={formStyles.error}>{error}</p>}

          <button type="submit" className={formStyles.submitBtn} disabled={submitting}>
            {submitting ? 'Saving…' : 'Create patient'}
          </button>
        </form>
      </div>
    </div>
  );
}
