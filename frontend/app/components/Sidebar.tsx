"use client";
import styles from './Sidebar.module.css';
import { Shield, Home, Map, FileText, Settings, User, LogOut, Network, Stethoscope } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/useAuth';
import { api } from '@/lib/api';

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await api.logout();
    } finally {
      router.replace('/login');
    }
  };
  const { user } = useAuth();

  return (
    <aside className={styles.sidebar}>
      <div className={styles.topLogo}>
        <Shield size={24} color="#000" />
      </div>

      <nav className={styles.navIcons}>
        <Link href="/" className={`${styles.iconWrapper} ${pathname === '/' ? styles.active : ''}`}>
          <Home size={20} />
        </Link>
        <Link href="/logs" className={`${styles.iconWrapper} ${pathname.startsWith('/logs') ? styles.active : ''}`}>
          <FileText size={20} />
        </Link>
        <Link href="/heatmap" className={`${styles.iconWrapper} ${pathname.startsWith('/heatmap') ? styles.active : ''}`}>
          <Map size={20} />
        </Link>
        <Link href="/patients" className={`${styles.iconWrapper} ${pathname.startsWith('/patients') ? styles.active : ''}`}>
          <User size={20} />
        </Link>
        {user?.role === 'local' && <Link href="/doctor" className={`${styles.iconWrapper} ${pathname.startsWith('/doctor') ? styles.active : ''}`} title="Doctor workspace">
          <Stethoscope size={20} />
        </Link>}
        {user?.role === 'global' && <Link href="/global" className={`${styles.iconWrapper} ${pathname.startsWith('/global') ? styles.active : ''}`} title="Global node">
          <Network size={20} />
        </Link>}
        <div className={styles.iconWrapper}>
          <Settings size={20} />
        </div>
      </nav>

      <div className={styles.bottomSection}>
        <button type="button" onClick={handleLogout} className={styles.uploadIcon} title="Logout">
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
}
