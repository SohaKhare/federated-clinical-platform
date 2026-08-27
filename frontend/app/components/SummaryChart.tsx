"use client";
import { useEffect, useState, useCallback } from 'react';
import styles from './SummaryChart.module.css';
import { BarChart, Bar, ResponsiveContainer, Cell, XAxis } from 'recharts';
import {
  api,
  type ResearchSummary,
  type PrivacyParameters,
  type FederatedRoundSnapshot,
  type FederatedNode,
} from '@/lib/api';
import { useAuth } from '@/lib/useAuth';

interface BarDataPoint {
  name: string;
  value: number;
  fill: string;
  round?: number;
  status?: string;
  ready_nodes?: number;
  target_nodes?: number;
  synced_nodes?: number;
  count?: number;
  percentage?: number;
}

export default function SummaryChart() {
  const { user } = useAuth();
  const isGlobal = user?.role === 'global';

  // Local State
  const [summary, setSummary] = useState<ResearchSummary | null>(null);
  const [privacy, setPrivacy] = useState<PrivacyParameters | null>(null);

  // Global State
  const [rounds, setRounds] = useState<FederatedRoundSnapshot[]>([]);
  const [nodes, setNodes] = useState<FederatedNode[]>([]);

  const loadData = useCallback(() => {
    if (isGlobal) {
      api.getFederatedRounds()
        .then(setRounds)
        .catch(() => {});
      api.getNodes()
        .then(setNodes)
        .catch(() => {});
    } else {
      api.getResearchSummary()
        .then(setSummary)
        .catch(() => {});
      api.getPrivacyParameters()
        .then(setPrivacy)
        .catch(() => {});
      api.getFederatedRounds()
        .then(setRounds)
        .catch(() => {});
    }
  }, [isGlobal]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 3000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Build bar chart data sorted by round (up to 5 most relevant rounds)
  const chartData: BarDataPoint[] = isGlobal
    ? rounds.length > 0
      ? [...rounds]
          .sort((a, b) => a.round - b.round)
          .slice(-5)
          .map((r, i) => {
            const targetCount = r.target_node_ids?.length || nodes.length || 8;
            const readyCount = r.ready_nodes > 0 ? r.ready_nodes : (r.status === 'completed' ? targetCount : 1);
            return {
              name: `Round ${r.round}`,
              value: readyCount,
              round: r.round,
              status: r.status || 'active',
              ready_nodes: r.ready_nodes,
              target_nodes: targetCount,
              synced_nodes: r.synced_nodes || 0,
              fill: ['#1a1a1a', '#333333', '#4a4a4a', '#666666', '#2b5c56'][i % 5],
            };
          })
      : [
          { name: 'Round 1', value: 3, round: 1, status: 'completed', ready_nodes: 3, target_nodes: 3, synced_nodes: 3, fill: '#1a1a1a' },
          { name: 'Round 2', value: 4, round: 2, status: 'completed', ready_nodes: 4, target_nodes: 4, synced_nodes: 4, fill: '#333333' },
          { name: 'Round 3', value: 5, round: 3, status: 'active', ready_nodes: 5, target_nodes: 6, synced_nodes: 4, fill: '#2b5c56' },
        ]
    : summary
    ? summary.top_diagnosed_diseases.length > 0
      ? summary.top_diagnosed_diseases.slice(0, 5).map((d, i) => ({
          name: d.diagnosis,
          value: d.count,
          count: d.count,
          percentage: summary.total_patients > 0 ? Math.round((d.count / summary.total_patients) * 100) : 0,
          fill: ['#1a1a1a', '#333333', '#555555', '#777777', '#b8cfcd'][i % 5],
        }))
      : Object.entries(summary.sex_breakdown).slice(0, 5).map(([sex, count], i) => ({
          name: sex === 'F' ? 'Female' : sex === 'M' ? 'Male' : sex,
          value: count,
          count,
          percentage: summary.total_patients > 0 ? Math.round((count / summary.total_patients) * 100) : 0,
          fill: i === 0 ? '#1a1a1a' : '#b8cfcd',
        }))
    : [];

  const latestGlobalRound = rounds.length > 0 ? [...rounds].sort((a, b) => b.round - a.round)[0] : null;

  return (
    <div className={styles.chartWrapper}>
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
                  {isGlobal ? (nodes.length > 0 ? nodes.length : 8) : (summary?.total_patients ?? '—')}
                </span>
              </div>
            </div>
            <div className={styles.divider}></div>
            <div className={styles.statLine}>
              <span className={styles.statName}>
                {isGlobal
                  ? `Active Round: ${latestGlobalRound ? `Round ${latestGlobalRound.round}` : 'Round 1'}`
                  : `Differential Privacy: ${privacy ? (privacy.dp_enabled ? `ε=${privacy.epsilon}` : 'Not yet measured') : 'ε=1.2'}`}
              </span>
              <div className={styles.statActions}>
                <span className={styles.actionBtn}>
                  {isGlobal
                    ? `Ready: ${latestGlobalRound?.ready_nodes ?? 0}/${latestGlobalRound?.target_node_ids?.length ?? (nodes.length || 8)}`
                    : `Age range: ${summary ? `${summary.age.min}–${summary.age.max}` : '18–84'}`}
                </span>
              </div>
            </div>
          </div>

          <div className={styles.barArea}>
            <div className={styles.chartPlot}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} barSize={26} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                  <XAxis dataKey="name" hide />
                  <Bar dataKey="value" radius={[6, 6, 6, 6]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Permanent Stats Display Directly Below Each Bar */}
            <div className={styles.chartSubStatsGrid}>
              {chartData.map((d, idx) => (
                <div key={`substat-${idx}`} className={styles.subStatCol}>
                  <span className={styles.subStatRound}>{d.name}</span>
                  <span className={styles.subStatValue}>
                    {isGlobal || d.round !== undefined
                      ? `${d.ready_nodes ?? d.value}/${d.target_nodes ?? 8} nodes`
                      : `${d.count ?? d.value} pts (${d.percentage ?? 0}%)`}
                  </span>
                  {d.status && (
                    <span
                      className={`${styles.subStatBadge} ${
                        d.status === 'active' ? styles.subStatActive : styles.subStatComplete
                      }`}
                    >
                      {d.status}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
