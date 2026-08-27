"use client";
import { useState } from 'react';
import styles from './page.module.css';
import PlatformSummary from '../components/PlatformSummary';
import SummaryChart from '../components/SummaryChart';
import LiveNetworkWidget from '../components/LiveNetworkWidget';
import ModelPerformanceWidget from '../components/ModelPerformanceWidget';
import DiseaseTrendChart from '../components/DiseaseTrendChart';
import RecentActivityWidget from '../components/RecentActivityWidget';
import PatientManagement from '../components/PatientManagement';
import NodeManagement from '../components/NodeManagement';
import LocalNodeMobileView from '../components/LocalNodeMobileView';
import { useAuth } from '@/lib/useAuth';

export default function Dashboard() {
  const { user } = useAuth();
  const isGlobal = user?.role === 'global';
  const [showAddPatientModal, setShowAddPatientModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <>
      {/* Mobile-Only View (Local Node Only) */}
      {!isGlobal && (
        <div className={styles.mobileView}>
          <LocalNodeMobileView />
        </div>
      )}

      {/* Desktop View (and Global Node View) */}
      <div className={!isGlobal ? styles.desktopView : styles.contentGrid}>
        <div className={styles.leftColumn}>
          {/* Top Platform / Clinical Summary with Action Buttons */}
          <PlatformSummary onAddPatient={() => setShowAddPatientModal(true)} />

          {/* Summary Chart with live federation polling & sub-stats */}
          <SummaryChart key={`chart-${refreshKey}`} />

          {/* Bottom widgets: Live Network, Disease Trends (local) / Model Performance (global), Recent Activity */}
          <div className={styles.bottomGrid}>
            <LiveNetworkWidget />
            {isGlobal ? <ModelPerformanceWidget /> : <DiseaseTrendChart />}
            <RecentActivityWidget />
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
    </>
  );
}
