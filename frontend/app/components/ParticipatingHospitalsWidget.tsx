"use client";
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from './ParticipatingHospitalsWidget.module.css';
import { Users, ArrowRight } from 'lucide-react';
import { api, type FederatedNode } from '@/lib/api';

export default function ParticipatingHospitalsWidget() {
  const [nodes, setNodes] = useState<FederatedNode[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.getNodes()
      .then((res) => {
        if (!cancelled) setNodes(res);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const count = nodes.length > 0 ? nodes.length : 8;

  return (
    <div className={styles.card}>
      <div className={styles.topLinkRow}>
        <Link href="/nodes" className={styles.viewAllLink}>
          <span>View all hospitals</span>
          <ArrowRight size={14} />
        </Link>
      </div>

      <div className={styles.contentBody}>
        <div className={styles.iconBox}>
          <Users size={24} />
        </div>
        <div className={styles.bigCount}>{count}</div>
        <div className={styles.labelText}>Participating Hospitals</div>
      </div>

      {/* Subtle curved wave illustration at the bottom */}
      <svg
        className={styles.waveBackground}
        viewBox="0 0 300 120"
        preserveAspectRatio="none"
      >
        <path
          d="M0,60 C80,20 160,90 300,45 L300,120 L0,120 Z"
          fill="#f0fdf9"
          opacity="0.9"
        />
        <path
          d="M0,75 C100,45 200,95 300,60 L300,120 L0,120 Z"
          fill="#d1fae5"
          opacity="0.4"
        />
      </svg>
    </div>
  );
}
