"use client";
import { useState } from 'react';
import styles from './page.module.css';
import PlatformSummary from '../components/PlatformSummary';
import SummaryChart from '../components/SummaryChart';
import AreaStats from '../components/AreaStats';
import LogsWidget from '../components/LogsWidget';
import HeatmapWidget from '../components/HeatmapWidget';
import PatientManagement from '../components/PatientManagement';
import NodeManagement from '../components/NodeManagement';
import { useAuth } from '@/lib/useAuth';

export default function Dashboard() {
  const { user } = useAuth();
  const isGlobal = user?.role === 'global';
  const [showAddPatientModal, setShowAddPatientModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className={styles.contentGrid}>
      <div className={styles.leftColumn}>
        {/* Top Platform / Clinical Summary with Action Buttons */}
        <PlatformSummary onAddPatient={() => setShowAddPatientModal(true)} />

        {/* Summary Chart */}
        <SummaryChart key={`chart-${refreshKey}`} />

        {/* Bottom Grid: Demographics/Area Stats, Logs Widget, Heatmap Widget */}
        <div className={styles.bottomGrid}>
          <AreaStats key={`stats-${refreshKey}`} />
          <LogsWidget />
          <HeatmapWidget />
        </div>
      </div>

      {/* Right Panel: Role-Specific Management */}
      <div className={styles.rightColumn}>
        {isGlobal ? (
          <NodeManagement />
        ) : (
          <PatientManagement
            showModalExternal={showAddPatientModal}
            onCloseModal={() => setShowAddPatientModal(false)}
            onPatientAdded={() => setRefreshKey((k) => k + 1)}
          />
        )}
      </div>
    </div>
  );
}
