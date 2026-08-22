import styles from './page.module.css';
import PlatformSummary from '../components/PlatformSummary';
import SummaryChart from '../components/SummaryChart';
import AreaStats from '../components/AreaStats';
import LogsWidget from '../components/LogsWidget';
import HeatmapWidget from '../components/HeatmapWidget';
import PatientManagement from '../components/PatientManagement';

export default function Dashboard() {
  return (
    <div className={styles.contentGrid}>
      <div className={styles.leftColumn}>
        {/* Platform Summary Stats */}
        <PlatformSummary />

        {/* Summary Chart */}
        <SummaryChart />

        {/* Bottom Grid: Area Stats, Logs Widget, Heatmap Widget */}
        <div className={styles.bottomGrid}>
          <AreaStats />
          <LogsWidget />
          <HeatmapWidget />
        </div>
      </div>

      {/* Right Panel: Patient Management */}
      <PatientManagement />
    </div>
  );
}
