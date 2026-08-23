"use client";
import { useEffect, useState } from 'react';
import styles from './SummaryChart.module.css';
import { BarChart, Bar, ResponsiveContainer, Cell } from 'recharts';
import { api, type ResearchSummary, type PrivacyParameters, type FederatedRoundSnapshot, type FederatedNode } from '@/lib/api';
import { useAuth } from '@/lib/useAuth';

export default function SummaryChart() {
  const { user } = useAuth();
  const isGlobal = user?.role === 'global';

  // Local State
  const [summary, setSummary] = useState<ResearchSummary | null>(null);
  const [privacy, setPrivacy] = useState<PrivacyParameters | null>(null);

  // Global State
  const [rounds, setRounds] = useState<FederatedRoundSnapshot[]>([]);
  const [nodes, setNodes] = useState<FederatedNode[]>([]);

  useEffect(() => {
    if (isGlobal) {
      api.getFederatedRounds().then(setRounds).catch(() => {});
      api.getNodes().then(setNodes).catch(() => {});
    } else {
      api.getResearchSummary().then(setSummary).catch(() => {});
      api.getPrivacyParameters().then(setPrivacy).catch(() => {});
    }
  }, [isGlobal]);

  // Build chart data based on role
  const chartData = isGlobal
    ? rounds.length > 0
      ? rounds.slice(0, 6).reverse().map((r, i) => ({
          name: `Round ${r.round}`,
          value: r.ready_nodes > 0 ? r.ready_nodes : Math.max(1, r.target_node_ids?.length || 1),
          fill: ['#1a1a1a', '#333333', '#555555', '#777777', '#999999', '#b8cfcd'][i % 6],
        }))
      : [
          { name: 'R1', value: 3, fill: '#1a1a1a' },
          { name: 'R2', value: 4, fill: '#333333' },
          { name: 'R3', value: 5, fill: '#555555' },
        ]
    : summary
    ? summary.top_diagnosed_diseases.length > 0
      ? summary.top_diagnosed_diseases.map((d, i) => ({
          name: d.diagnosis,
          value: d.count,
          fill: ['#1a1a1a', '#333333', '#555555', '#777777', '#999999', '#b8cfcd'][i % 6],
        }))
      : Object.entries(summary.sex_breakdown).map(([sex, count], i) => ({
          name: sex === 'F' ? 'Female' : sex === 'M' ? 'Male' : sex,
          value: count,
          fill: i === 0 ? '#1a1a1a' : '#b8cfcd',
        }))
    : [];

  const latestGlobalRound = rounds.length > 0 ? rounds[0] : null;

  return (
    <div className={styles.chartWrapper}>
      {/* Main Chart Box */}
      <div className={styles.chartContainer}>
        <div className={styles.chartHeader}>
          <div className={styles.headerLeft}>
            <span className={styles.badge}>{isGlobal ? 'Federation' : 'Research'}</span>
            <h2 className={styles.title}>
              {isGlobal ? 'Global Rounds Overview' : 'Hospital Overview'}
            </h2>
          </div>
          <div className={styles.headerRight}>
            <div className={styles.legend}>
              <span className={styles.legendDot}></span> {isGlobal ? 'Participating Nodes' : 'Top Diagnoses'}
            </div>
            <div className={styles.legend}>
              <span className={styles.legendDotLight}></span> {isGlobal ? 'Offline' : 'Other'}
            </div>
          </div>
        </div>

        <div className={styles.contentArea}>
          <div className={styles.statsCard}>
            <div className={styles.statLine}>
              <span className={styles.statName}>
                {isGlobal ? 'Total hospital nodes' : 'Total patients'}
              </span>
              <div className={styles.statValueRow}>
                 <span className={styles.bigNum}>
                   {isGlobal ? nodes.length : (summary?.total_patients ?? '—')}
                 </span>
              </div>
            </div>
            <div className={styles.divider}></div>
            <div className={styles.statLine}>
              <span className={styles.statName}>
                {isGlobal
                  ? `Active Round: ${latestGlobalRound ? `Round ${latestGlobalRound.round}` : 'Idle'}`
                  : `Differential Privacy: ${privacy ? (privacy.dp_enabled ? `ε=${privacy.epsilon}` : 'Not yet measured') : '…'}`}
              </span>
              <div className={styles.statActions}>
                 <span className={styles.actionBtn}>
                   {isGlobal
                     ? `Ready: ${latestGlobalRound?.ready_nodes ?? 0}/${latestGlobalRound?.target_node_ids?.length ?? nodes.length}`
                     : `Age range: ${summary ? `${summary.age.min}–${summary.age.max}` : '—'}`}
                 </span>
              </div>
            </div>
          </div>

          <div className={styles.barArea}>
             <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barSize={24}>
                <Bar dataKey="value" radius={[6, 6, 6, 6]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
