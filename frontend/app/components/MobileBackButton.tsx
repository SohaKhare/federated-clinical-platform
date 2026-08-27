"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import styles from './MobileBackButton.module.css';

export default function MobileBackButton({ label = "Back", forceShow = false }: { label?: string; forceShow?: boolean }) {
  const pathname = usePathname();

  if (pathname === '/' && !forceShow) {
    return null;
  }

  return (
    <Link href="/" className={`${styles.backBtn} ${forceShow ? '' : styles.mobileOnly}`}>
      <ArrowLeft size={16} />
      <span>{label}</span>
    </Link>
  );
}
