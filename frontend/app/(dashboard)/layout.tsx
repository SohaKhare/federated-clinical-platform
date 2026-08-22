import styles from './layout.module.css';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.appLayout}>
      <div className={styles.sidebarWrapper}>
        <Sidebar />
      </div>
      
      <div className={styles.mainWrapper}>
        <div className={styles.headerWrapper}>
          <Header />
        </div>
        <div className={styles.contentWrapper}>
          {children}
        </div>
      </div>
    </div>
  );
}
