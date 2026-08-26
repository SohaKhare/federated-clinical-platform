"use client";
import React from 'react';
import Link from 'next/link';
import styles from './PlatformSummary.module.css';
import { Plus, Users, Server, Map } from 'lucide-react';
import { useAuth } from '@/lib/useAuth';

interface PlatformSummaryProps {
  onAddPatient?: () => void;
}

export default function PlatformSummary({ onAddPatient }: PlatformSummaryProps) {
  const { user } = useAuth();
  const isGlobal = user?.role === 'global';

  return (
    <div className={styles.summaryContainer}>
      <div className={styles.titleSection}>
        <h1 className={styles.title}>
          {isGlobal ? 'Global Node Federation' : 'Clinical Summary'}
        </h1>
      </div>

      <div className={styles.actionButtons}>
        {isGlobal ? (
          <>
            <Link href="/nodes" className={styles.primaryBtn} id="btn-view-nodes">
              <Server size={16} />
              <span>Hospital Nodes</span>
            </Link>
            <Link href="/heatmap" className={styles.secondaryBtn} id="btn-view-heatmap">
              <Map size={16} />
              <span>Network Heatmap</span>
            </Link>
          </>
        ) : (
          <>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={onAddPatient}
              id="btn-add-patient"
              aria-label="Add Patient"
            >
              <Plus size={16} strokeWidth={2.5} />
              <span>Add Patient</span>
            </button>
            <Link
              href="/patients"
              className={styles.secondaryBtn}
              id="btn-edit-patients"
              aria-label="Edit Patients"
            >
              <Users size={16} />
              <span>Edit Patients</span>
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
