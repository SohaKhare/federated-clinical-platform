"use client";
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import styles from './PatientManagement.module.css';
import formStyles from './PatientFormModal.module.css';
import { Plus, ChevronRight, X, User } from 'lucide-react';
import { api, ApiError, type Patient, type NewPatientInput } from '@/lib/api';
import { useToast } from '@/lib/ToastContext';

interface PatientManagementProps {
  showModalExternal?: boolean;
  onCloseModal?: () => void;
  onPatientAdded?: () => void;
}

export default function PatientManagement({
  showModalExternal,
  onCloseModal,
  onPatientAdded,
}: PatientManagementProps) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [showInternalForm, setShowInternalForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const { success } = useToast();

  const isModalOpen = showModalExternal !== undefined ? showModalExternal : showInternalForm;
  const handleCloseModal = onCloseModal || (() => setShowInternalForm(false));

  const loadPatients = useCallback(() => {
    api.getPatients()
      .then(setPatients)
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadPatients();
  }, [loadPatients]);

  const recent = patients.slice(0, 8);

  return (
    <div className={styles.container}>
      {/* Patient List */}
      <div className={styles.listSection}>
        <div className={styles.sectionHeader}>
          <h4 className={styles.listTitle}>
            Patients <span>{patients.length} registered</span>
          </h4>
        </div>

        <div className={styles.listItems}>
          {recent.length === 0 && (
            <div className={styles.listItem}>
              <span className={styles.itemName}>No patients yet</span>
            </div>
          )}
          {recent.map((p) => (
            <Link key={p.patient_id} href={`/patients/${p.patient_id}`} style={{ textDecoration: 'none' }}>
              <div className={styles.listItem}>
                <div className={styles.itemMain}>
                  <div className={styles.avatarMini}>
                    <User size={12} />
                  </div>
                  <span className={styles.itemName}>{p.name}</span>
                </div>
                <div className={styles.itemControls}>
                  <div className={styles.dotsGroup}>
                    <span className={(p.diagnosed_diseases?.length ?? 0) > 0 ? styles.dotGreen : styles.dotLight}></span>
                    <span className={styles.dotLight}></span>
                  </div>
                  <ChevronRight size={14} color="#666" />
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className={styles.listFooter}>
          <Link href="/patients" className={styles.viewAllBtn} style={{ width: '100%', justifyContent: 'center' }}>
            View catalogue <ChevronRight size={12} />
          </Link>
        </div>
      </div>

      {/* Node Status / Summary Card */}
      <div className={styles.expandCard}>
        <div className={styles.expandHeader}>
          <div className={styles.progressValue}>{patients.length}</div>
          <span className={styles.progressSub}>local patients enrolled</span>
        </div>
        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: `${Math.min(100, patients.length * 20)}%` }}></div>
          <div className={styles.progressDot} style={{ left: `${Math.min(95, patients.length * 20)}%` }}></div>
          <div className={styles.progressTrackDots}></div>
        </div>
        <div className={styles.expandContent}>
          <h5 className={styles.expandTitle}>Local Hospital Node</h5>
          <p className={styles.expandDesc}>Records ready for differential privacy training rounds</p>
          <Link href="/patients" className={styles.viewAllBtn}>
            All records <ChevronRight size={12} />
          </Link>
        </div>
      </div>

      {/* Add Patient Modal */}
      {isModalOpen && (
        <AddPatientModal
          submitting={submitting}
          error={formError}
          onClose={handleCloseModal}
          onSubmit={async (input) => {
            setSubmitting(true);
            setFormError('');
            try {
              await api.createPatient(input);
              success(`Patient "${input.name}" successfully added to local node!`);
              handleCloseModal();
              loadPatients();
              onPatientAdded?.();
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

export interface AddPatientInput {
  name: string;
  age: number;
  sex: string;
  symptoms: string[];
  diagnosed_diseases: string[];
  health_conditions: Record<string, unknown>;
}

export function AddPatientModal({
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
          <h3>Add Patient</h3>
          <button type="button" className={formStyles.closeBtn} onClick={onClose} aria-label="Close dialog">
            <X size={16} />
          </button>
        </div>

        <form className={formStyles.form} onSubmit={handleSubmit}>
          <div className={formStyles.row}>
            <label className={formStyles.field}>
              <span>Name *</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Rekha Sharma"
                required
                autoFocus
              />
            </label>
            <label className={formStyles.field}>
              <span>Age *</span>
              <input
                type="number"
                min="0"
                max="120"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="34"
                required
              />
            </label>
            <label className={formStyles.field}>
              <span>Sex *</span>
              <select value={sex} onChange={(e) => setSex(e.target.value)}>
                <option value="F">Female (F)</option>
                <option value="M">Male (M)</option>
              </select>
            </label>
          </div>

          <label className={formStyles.field}>
            <span>Symptoms (comma separated)</span>
            <input
              type="text"
              value={symptoms}
              onChange={(e) => setSymptoms(e.target.value)}
              placeholder="chest pain, shortness of breath, fatigue"
            />
          </label>

          <label className={formStyles.field}>
            <span>Diagnosed diseases (comma separated)</span>
            <input
              type="text"
              value={diseases}
              onChange={(e) => setDiseases(e.target.value)}
              placeholder="ICD10_I20, ICD10_J45"
            />
          </label>

          <div className={formStyles.row}>
            <label className={formStyles.field}>
              <span>Blood pressure</span>
              <input
                type="text"
                value={bp}
                onChange={(e) => setBp(e.target.value)}
                placeholder="130/85"
              />
            </label>
            <label className={formStyles.field}>
              <span>Blood Sugar</span>
              <input
                type="text"
                value={sugar}
                onChange={(e) => setSugar(e.target.value)}
                placeholder="110 mg/dL"
              />
            </label>
            <label className={formStyles.field}>
              <span>Allergies</span>
              <input
                type="text"
                value={allergies}
                onChange={(e) => setAllergies(e.target.value)}
                placeholder="penicillin, pollen"
              />
            </label>
          </div>

          {error && <p className={formStyles.error}>{error}</p>}

          <button type="submit" className={formStyles.submitBtn} disabled={submitting}>
            {submitting ? 'Saving Patient…' : 'Add Patient'}
          </button>
        </form>
      </div>
    </div>
  );
}
