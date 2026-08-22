import styles from './patients.module.css';
import { api } from '../../../lib/api';
import { Search, Plus } from 'lucide-react';

export default async function PatientsPage() {
  const patients = await api.getPatients();

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Patients</h1>
          <p className={styles.subtitle}>Manage your federated clinical data subjects</p>
        </div>
        <button className={styles.addBtn}>
          <Plus size={16} /> Add Patient
        </button>
      </div>

      <div className={styles.searchBar}>
        <Search size={18} color="#666" />
        <input type="text" placeholder="Search patients by ID or name..." />
      </div>

      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Risk Level</th>
              <th>Last Event</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {patients.map(p => (
              <tr key={p.id}>
                <td>#{p.id}</td>
                <td className={styles.fw500}>{p.name}</td>
                <td>
                  <span className={`${styles.badge} ${styles[p.risk.toLowerCase()]}`}>
                    {p.risk}
                  </span>
                </td>
                <td>{p.lastEvent}</td>
                <td>
                  <a href={`/patients/${p.id}`} className={styles.viewLink}>View Details</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
