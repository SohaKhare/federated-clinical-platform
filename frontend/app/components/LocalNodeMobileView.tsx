"use client";
import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import styles from './LocalNodeMobileView.module.css';
import RecentActivityWidget from './RecentActivityWidget';
import { AddPatientModal, type AddPatientInput } from './PatientManagement';
import {
  Search,
  Plus,
  ChevronRight,
  ArrowUp,
  X,
  FileText,
  Activity,
  Stethoscope,
} from 'lucide-react';
import { api, type Patient } from '@/lib/api';
import { useToast } from '@/lib/ToastContext';

export default function LocalNodeMobileView() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const { success, error: toastError } = useToast();

  const loadPatients = useCallback(() => {
    api.getPatients()
      .then(setPatients)
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadPatients();
  }, [loadPatients]);

  // Scroll to top visibility listener
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 150) {
        setShowScrollTop(true);
      } else {
        setShowScrollTop(false);
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Filter patients by search query
  const filteredPatients = patients.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.patient_id.toLowerCase().includes(q) ||
      (p.diagnosed_diseases && p.diagnosed_diseases.some((d) => d.toLowerCase().includes(q)))
    );
  });

  const recentPatients = filteredPatients.slice(0, 5);

  const handleCreatePatient = async (input: AddPatientInput) => {
    setSubmitting(true);
    setFormError('');

    try {
      const created = await api.createPatient(input);
      setShowAddModal(false);
      loadPatients();
      success(`Patient "${created.name}" successfully registered!`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to register patient';
      setFormError(msg);
      toastError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.mobileContainer}>
      {/* Top Header - Text Only with Turquoise Accent */}
      <header className={styles.topNav}>
        <h1 className={styles.brandTitle}>
          Clinic <span className={styles.brandAccent}>Sum</span>
        </h1>

        <div className={styles.navActions}>
          <Link
            href="/doctor"
            className={styles.doctorBtn}
            title="Doctor Space"
            aria-label="Doctor Space"
          >
            <Stethoscope size={15} />
            <span>Doctor Space</span>
          </Link>

          <button
            type="button"
            className={`${styles.iconBtn} ${showSearch ? styles.iconBtnActive : ''}`}
            onClick={() => setShowSearch((s) => !s)}
            aria-label="Search options"
          >
            {showSearch ? <X size={16} /> : <Search size={16} />}
          </button>
        </div>
      </header>

      {/* Search Input & Quick Filter Options */}
      {showSearch && (
        <div className={styles.searchSection}>
          <div className={styles.searchInputWrapper}>
            <Search size={15} color="#666666" />
            <input
              type="text"
              placeholder="Search patients, diseases, activity..."
              className={styles.searchInput}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666666' }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className={styles.quickFilters}>
            <Link href="/patients" className={styles.filterChip}>
              <FileText size={12} style={{ display: 'inline', marginRight: '4px' }} /> Patient Records
            </Link>
            <Link href="/logs" className={styles.filterChip}>
              <Activity size={12} style={{ display: 'inline', marginRight: '4px' }} /> Activity Logs
            </Link>
            <Link href="/doctor" className={styles.filterChip}>
              <Stethoscope size={12} style={{ display: 'inline', marginRight: '4px' }} /> Doctor Workspace
            </Link>
          </div>
        </div>
      )}

      {/* Add Patients Box with Turquoise/Sage Box and Black Pill Button */}
      <div className={styles.addPatientCard}>
        <div className={styles.addPatientLeft}>
          <h3 className={styles.addPatientTitle}>Add Patients</h3>
          <p className={styles.addPatientDesc}>Register new clinical profile & baseline records</p>
        </div>
        <button
          type="button"
          className={styles.blackPillBtn}
          onClick={() => setShowAddModal(true)}
        >
          <Plus size={16} /> Add Patient
        </button>
      </div>

      {/* Patients Records Card - Well Spaced from Borders */}
      <div className={styles.patientsCard}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Patients Records</h2>
          <span className={styles.cardBadge}>{patients.length} registered</span>
        </div>

        <div className={styles.patientRows}>
          {recentPatients.length === 0 ? (
            <p style={{ fontSize: '0.82rem', color: '#666666', textAlign: 'center', padding: '1.25rem' }}>
              {searchQuery ? 'No matching patients found' : 'No patients registered yet'}
            </p>
          ) : (
            recentPatients.map((p) => {
              const primaryDiagnosis = p.diagnosed_diseases && p.diagnosed_diseases.length > 0
                ? p.diagnosed_diseases[0]
                : null;

              return (
                <Link
                  key={p.patient_id}
                  href={`/patients/${p.patient_id}`}
                  className={styles.patientItem}
                >
                  <div className={styles.patientLeft}>
                    <div className={styles.avatarCircle}>
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <div className={styles.patientInfo}>
                      <span className={styles.patientName}>{p.name}</span>
                      <span className={styles.patientMeta}>
                        {p.age} yrs • {p.sex === 'F' ? 'Female' : 'Male'}
                      </span>
                    </div>
                  </div>

                  <div className={styles.patientRight}>
                    {primaryDiagnosis ? (
                      <span className={styles.diagnosisTag} title={p.diagnosed_diseases.join(', ')}>
                        {primaryDiagnosis}
                      </span>
                    ) : (
                      <span className={styles.diagnosisTagNone}>General</span>
                    )}
                    <ChevronRight size={15} color="#666666" />
                  </div>
                </Link>
              );
            })
          )}
        </div>

        {/* Expand & View Full Patients Catalogue on a new page */}
        <Link href="/patients" className={styles.expandCatalogueBtn}>
          View all catalogue ({patients.length}) <ChevronRight size={14} />
        </Link>
      </div>

      {/* Recent Activity Widget Component */}
      <RecentActivityWidget />

      {/* Scroll to top floating button */}
      {showScrollTop && (
        <button
          type="button"
          className={styles.scrollTopBtn}
          onClick={scrollToTop}
          aria-label="Scroll to top"
        >
          <ArrowUp size={18} />
        </button>
      )}

      {/* Reusable Add Patient Modal Popup */}
      {showAddModal && (
        <AddPatientModal
          onSubmit={handleCreatePatient}
          onClose={() => setShowAddModal(false)}
          submitting={submitting}
          error={formError}
        />
      )}
    </div>
  );
}
