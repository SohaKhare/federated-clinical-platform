"use client";
import styles from './Sidebar.module.css';
import { Shield, Home, Map, FileText, User, Server, LogOut, Stethoscope } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/useAuth';
import { api } from '@/lib/api';

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const isGlobal = user?.role === 'global';

  const handleLogout = async () => {
    try {
      await api.logout();
    } finally {
      router.replace('/login');
    }
  };

  return (
    <aside className={styles.sidebar}>
      <div className={styles.topLogo}>
        <Shield size={24} color="#000" />
      </div>

      <nav className={styles.navIcons}>
        <Link href="/" className={`${styles.iconWrapper} ${pathname === '/' ? styles.active : ''}`} title="Dashboard">
          <Home size={20} />
        </Link>
        <Link href="/logs" className={`${styles.iconWrapper} ${pathname.startsWith('/logs') ? styles.active : ''}`} title="Data Logs">
          <FileText size={20} />
        </Link>
        <Link href="/heatmap" className={`${styles.iconWrapper} ${pathname.startsWith('/heatmap') ? styles.active : ''}`} title="Heatmap">
          <Map size={20} />
        </Link>
        {isGlobal ? (
          <Link href="/nodes" className={`${styles.iconWrapper} ${pathname.startsWith('/nodes') ? styles.active : ''}`} title="Hospital Nodes">
            <Server size={20} />
          </Link>
        ) : (
          <>
            <Link href="/patients" className={`${styles.iconWrapper} ${pathname.startsWith('/patients') ? styles.active : ''}`} title="Patients Catalogue">
              <User size={20} />
            </Link>
            <Link href="/doctor" className={`${styles.iconWrapper} ${pathname.startsWith('/doctor') ? styles.active : ''}`} title="Doctor workspace">
              <Stethoscope size={20} />
            </Link>
          </>
        )}
      </nav>

      <div className={styles.bottomSection}>
        <button type="button" onClick={handleLogout} className={styles.uploadIcon} title="Logout">
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
}
