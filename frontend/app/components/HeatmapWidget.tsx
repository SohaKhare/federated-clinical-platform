"use client";
import styles from './HeatmapWidget.module.css';
import { useRouter } from 'next/navigation';
import { Heart, Share2 } from 'lucide-react';

export default function HeatmapWidget() {
  const router = useRouter();

  return (
    <div className={styles.container} onClick={() => router.push('/heatmap')} style={{ cursor: 'pointer' }}>
      <div className={styles.header}>
        <h3 className={styles.title}>Heatmap</h3>
        <span className={styles.subtitle}>Geographic distributions</span>
      </div>

      <div className={styles.card}>
        <div className={styles.cardIcons}>
          <div className={styles.iconCircle}><Heart size={14} color="#666" /></div>
          <div className={styles.iconCircle}><Share2 size={14} color="#666" /></div>
        </div>

        {/* Abstract shape representing the heatmap/3D object */}
        <div className={styles.abstractShape}>
          <div className={styles.circle1}></div>
          <div className={styles.circle2}></div>
          <div className={styles.circle3}></div>
        </div>

        <div className={styles.cardFooter}>
          <span className={styles.footerText}>Generate Heatmap</span>
          <div className={styles.footerBadge}>Run</div>
        </div>
      </div>
    </div>
  );
}
