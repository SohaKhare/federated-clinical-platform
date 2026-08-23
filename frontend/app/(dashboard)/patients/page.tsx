"use client";
import { useEffect, useState } from 'react';
import styles from './patients.module.css';
import { api } from '../../../lib/api';
import { Search, Moon } from 'lucide-react';

interface Patient {
  patient_id: string;
  hospital_id: string;
  name: string;
  age: number;
  sex: string;
  contributed_to_round: number;
  updated_at: string;
  created_at: string;
}

export default function PatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await api.getPatients();
        setPatients(data);
      } catch (e) {
        console.error("Failed to load patients", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const formatDate = (isoString: string) => {
    const d = new Date(isoString);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const shortenId = (id: string) => id.split('-')[0];

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Patients Catalogue</h1>
          <p className={styles.subtitle}>Manage and explore all patients</p>
        </div>
        <button className={styles.themeToggle}>
          <Moon size={18} />
        </button>
      </div>

      <div className={styles.controls}>
        <div className={styles.searchWrapper}>
          <Search size={18} className={styles.searchIcon} />
          <input type="text" className={styles.searchInput} placeholder="Search patients..." />
        </div>
        <select className={styles.filterSelect}>
          <option>All</option>
          <option>Male</option>
          <option>Female</option>
        </select>
      </div>

      <div className={styles.resultsCount}>
        {patients.length} patients found
      </div>

      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>ID</th>
              <th>NAME</th>
              <th>AGE</th>
              <th>SEX</th>
              <th>ROUNDS</th>
              <th>ADDED</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6}>Loading...</td></tr>
            ) : patients.map(p => (
              <tr key={p.patient_id}>
                <td className={styles.idCell}>{shortenId(p.patient_id)}</td>
                <td className={styles.fw500}>{p.name}</td>
                <td>{p.age}</td>
                <td>
                  <span className={`${styles.pillBadge} ${p.sex === 'F' ? styles.pillF : styles.pillM}`}>
                    {p.sex === 'F' ? 'Female' : 'Male'}
                  </span>
                </td>
                <td>{p.contributed_to_round}</td>
                <td className={styles.dateText}>{formatDate(p.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
