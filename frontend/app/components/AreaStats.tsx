"use client";
import { useEffect, useState } from 'react';
import styles from './AreaStats.module.css';
import { Eye, Shield, Activity, Server, Radio } from 'lucide-react';
import { api, type ResearchSummary, type FederatedNode } from '@/lib/api';
import { useAuth } from '@/lib/useAuth';

export default function AreaStats() {
  const { user } = useAuth();
  const isGlobal = user?.role === 'global';

  const [summary, setSummary] = useState<ResearchSummary | null>(null);
  const [nodes, setNodes] = useState<FederatedNode[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (isGlobal) {
      api.getNodes()
        .then((n) => {
          if (!cancelled) setNodes(n);
        })
        .catch(() => {});
    } else {
      api.getResearchSummary()
        .then((s) => {
          if (!cancelled) setSummary(s);
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [isGlobal]);

  // Local demographics metrics
  const total = summary ? Object.values(summary.sex_breakdown).reduce((a, b) => a + b, 0) : 0;
  const femalePct = total > 0 ? Math.round(((summary?.sex_breakdown['F'] ?? 0) / total) * 100) : 0;
  const malePct = total > 0 ? Math.round(((summary?.sex_breakdown['M'] ?? 0) / total) * 100) : 0;
  const avgAge = summary ? Math.round(summary.age.average) : 0;
  const topDiagnosis = summary?.top_diagnosed_diseases[0];
  const diagnosisShare =
    summary && topDiagnosis && summary.total_patients > 0
      ? Math.round((topDiagnosis.count / summary.total_patients) * 100)
      : 0;

  // Global node health metrics
  const totalNodes = nodes.length;
  const activeCount = nodes.filter((n) => n.status === 'active').length;
  const activePct = totalNodes > 0 ? Math.round((activeCount / totalNodes) * 100) : 0;
  const idleCount = nodes.filter((n) => n.status === 'idle').length;
  const idlePct = totalNodes > 0 ? Math.round((idleCount / totalNodes) * 100) : 0;
  const regCount = nodes.filter((n) => n.status === 'registered' || !n.status).length;
  const regPct = totalNodes > 0 ? Math.round((regCount / totalNodes) * 100) : 0;

  const localSliders = [
    { label: 'Female', pct: femalePct, color: '#e2d9ec', icon: <Eye size={14} />, active: false },
    { label: 'Male', pct: malePct, color: '#d9e2ec', icon: <Shield size={14} />, active: false },
    { label: 'Avg Age', pct: Math.min(100, avgAge), display: `${avgAge} yrs`, color: '#1a1a1a', icon: <Activity size={14} />, active: true },
    {
      label: topDiagnosis?.diagnosis ?? 'Top Diagnosis',
      pct: diagnosisShare,
      color: '#d9ecea',
      icon: <Shield size={14} />,
      active: false,
    },
  ];

  const globalSliders = [
    { label: 'Active', pct: activePct, color: '#d9ecea', icon: <Activity size={14} />, active: true },
    { label: 'Registered', pct: regPct, color: '#d9e2ec', icon: <Server size={14} />, active: false },
    { label: 'Idle', pct: idlePct, color: '#e2d9ec', icon: <Radio size={14} />, active: false },
    {
      label: 'Hospitals',
      pct: Math.min(100, totalNodes * 20),
      display: `${totalNodes} nodes`,
      color: '#1a1a1a',
      icon: <Shield size={14} />,
      active: false,
    },
  ];

  const currentSliders = isGlobal ? globalSliders : localSliders;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>{isGlobal ? 'Node Network' : 'Demographics'}</h3>
        <span className={styles.subtitle}>{isGlobal ? 'Hospital node distribution' : 'Patient distribution'}</span>
      </div>

      <div className={styles.sliders}>
        {currentSliders.map((s) => (
          <div key={s.label} className={styles.sliderCol} title={s.label}>
            <div className={styles.sliderTrack}>
              <div
                className={styles.sliderFill}
                style={{ height: `${Math.max(4, s.pct)}%`, backgroundColor: s.color }}
              ></div>
            </div>
            <span className={styles.sliderValue}>{'display' in s && s.display ? s.display : `${s.pct}%`}</span>
            <div className={`${styles.iconWrapper} ${s.active ? styles.iconActive : ''}`}>{s.icon}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
