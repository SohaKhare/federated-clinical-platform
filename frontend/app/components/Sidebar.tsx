"use client";
import styles from './Sidebar.module.css';
import { Shield, Home, Map, FileText, Settings, Key, User, Moon, LogOut } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Sidebar() {
  const pathname = usePathname();

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
        <div className={styles.iconWrapper}>
          <Settings size={20} />
        </div>
      </nav>

      <div className={styles.bottomSection}>
        <div className={styles.userProfile}>
          <User size={20} />
        </div>
        <Link href="/login" className={styles.uploadIcon} title="Logout">
          <LogOut size={16} />
        </Link>
      </div>
    </aside>
  );
}
