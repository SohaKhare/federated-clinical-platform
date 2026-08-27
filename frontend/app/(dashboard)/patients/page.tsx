"use client";
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import styles from './patients.module.css';
import { api, type Patient } from '@/lib/api';
import { Search } from 'lucide-react';
import PresentationBatchButton from '../../components/PresentationBatchButton';
import MobileBackButton from '../../components/MobileBackButton';

export default function PatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sexFilter, setSexFilter] = useState('All');

  // All state updates happen inside promise callbacks, so nothing mutates
  // state synchronously during render/effect bodies
  // (react-hooks/set-state-in-effect). Also reused as the batch-added
  // refresh callback via PresentationBatchButton's `onAdded`.
  const loadPatients = useCallback(() => {
    return api
      .getPatients()
      .then(setPatients)
      .catch((e) => {
        console.error('Failed to load patients', e);
        setError(e instanceof Error ? e.message : 'Failed to load patients');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadPatients();
  }, [loadPatients]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return patients.filter((p) => {
      if (sexFilter !== 'All' && p.sex !== sexFilter) return false;
      if (!term) return true;
      return (
        p.name.toLowerCase().includes(term) ||
        p.patient_id.toLowerCase().includes(term) ||
        p.diagnosed_diseases.some((d) => d.toLowerCase().includes(term)) ||
        p.symptoms.some((s) => s.toLowerCase().includes(term))
      );
    });
  }, [patients, search, sexFilter]);

  const formatDate = (isoString: string) => {
    const d = new Date(isoString);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const shortenId = (id: string) => id.split('-')[0];

  return (
    <div className={styles.container}>
      <MobileBackButton />
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Patients Catalogue</h1>
          <p className={styles.subtitle}>Manage and explore all patients</p>
        </div>
      </div>

      <PresentationBatchButton onAdded={loadPatients} />

      <div className={styles.controls}>
        <div className={styles.searchWrapper}>
          <Search size={18} className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search patients..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className={styles.filterSelect}
          value={sexFilter}
          onChange={(e) => setSexFilter(e.target.value)}
        >
          <option>All</option>
          <option value="M">Male</option>
          <option value="F">Female</option>
        </select>
      </div>

      <div className={styles.resultsCount}>
        {loading ? 'Loading…' : error ? error : `${filtered.length} patients found`}
      </div>

      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>ID</th>
              <th>NAME</th>
              <th>AGE</th>
              <th>SEX</th>
              <th>DIAGNOSES</th>
              <th>ROUNDS</th>
              <th>ADDED</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7}>Loading...</td></tr>
            ) : !error && filtered.length === 0 ? (
              <tr><td colSpan={7}>No patients found.</td></tr>
            ) : (
              filtered.map((p) => (
                <tr key={p.patient_id}>
                  <td className={styles.idCell}>
                    <Link href={`/patients/${p.patient_id}`}>#{shortenId(p.patient_id)}</Link>
                  </td>
                  <td className={styles.fw500}>{p.name}</td>
                  <td>{p.age}</td>
                  <td>
                    <span className={`${styles.pillBadge} ${p.sex === 'F' ? styles.pillF : styles.pillM}`}>
                      {p.sex === 'F' ? 'Female' : 'Male'}
                    </span>
                  </td>
                  <td>{p.diagnosed_diseases.length > 0 ? p.diagnosed_diseases.join(', ') : '—'}</td>
                  <td>{p.contributed_to_round ?? '—'}</td>
                  <td className={styles.dateText}>{formatDate(p.created_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
