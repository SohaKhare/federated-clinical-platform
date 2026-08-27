"use client";
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import styles from './PatientManagement.module.css';
import { Server, Play, ChevronRight, CheckCircle2, RefreshCw, Cpu, Activity } from 'lucide-react';
import { api, type FederatedNode, type FederatedRoundSnapshot } from '@/lib/api';
import { useToast } from '@/lib/ToastContext';

export default function NodeManagement() {
  const [nodes, setNodes] = useState<FederatedNode[]>([]);
  const [rounds, setRounds] = useState<FederatedRoundSnapshot[]>([]);
  const [working, setWorking] = useState(false);
  const { success, error } = useToast();

  const loadData = useCallback(() => {
    api.getNodes().then(setNodes).catch(() => {});
    api.getFederatedRounds().then(setRounds).catch(() => {});
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 3000);
    return () => clearInterval(interval);
  }, [loadData]);

  const latestRound = rounds.length > 0 ? [...rounds].sort((a, b) => b.round - a.round)[0] : null;

  const handleStartRound = async () => {
    setWorking(true);
    try {
      await api.startGlobalRound();
      success('New federated round successfully initiated across active nodes!');
      loadData();
    } catch (err) {
      error(err instanceof Error ? err.message : 'Unable to start round.');
    } finally {
      setWorking(false);
    }
  };

  const handleBroadcast = async (roundId: string) => {
    setWorking(true);
    try {
      await api.broadcastGlobalWeights(roundId);
      success('Global aggregated weights successfully broadcasted to nodes!');
      loadData();
    } catch (err) {
      error(err instanceof Error ? err.message : 'Broadcast failed.');
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className={styles.container}>
      {/* Federation Control Compact Card */}
      <div className={styles.controlCard}>
        <div className={styles.controlHeader}>
          <h4 className={styles.listTitle}>
            Federation Control
          </h4>
          <Server size={14} color="#0d9488" />
        </div>

        <div className={styles.metricsRow}>
          <span className={`${styles.metricChip} ${latestRound?.status === 'active' ? styles.metricChipActive : ''}`}>
            <Activity size={12} />
            {latestRound ? `Round ${latestRound.round} · ${latestRound.status}` : 'Round 1 · Ready for aggregation'}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.35rem' }}>
          <button
            type="button"
            className={styles.addBtn}
            onClick={handleStartRound}
            disabled={working}
            style={{
              flex: 1,
              backgroundColor: 'var(--color-text-main)',
              color: '#fff',
              border: 'none',
              padding: '0.6rem 0.5rem',
              justifyContent: 'center',
              borderRadius: '12px',
              fontSize: '0.75rem',
              fontWeight: 600,
            }}
          >
            <Play size={12} /> {working ? 'Running…' : 'Start Round'}
          </button>
          {latestRound && latestRound.ready_nodes > 0 && latestRound.status !== 'completed' && (
            <button
              type="button"
              className={styles.addBtn}
              onClick={() => handleBroadcast(latestRound.round_id)}
              disabled={working}
              style={{
                flex: 1,
                backgroundColor: '#10b981',
                color: '#fff',
                border: 'none',
                padding: '0.6rem 0.5rem',
                justifyContent: 'center',
                borderRadius: '12px',
                fontSize: '0.75rem',
                fontWeight: 600,
              }}
            >
              <CheckCircle2 size={12} /> Broadcast
            </button>
          )}
        </div>
      </div>

      {/* Hospital Nodes List - Expands to fill available vertical space */}
      <div className={styles.listSection}>
        <div className={styles.sectionHeader}>
          <h4 className={styles.listTitle}>
            Hospitals <span>{nodes.length} connected</span>
          </h4>
        </div>

        <div className={styles.listItems}>
          {nodes.length === 0 && (
            <div className={styles.listItem}>
              <span className={styles.itemName}>No nodes registered yet</span>
            </div>
          )}
          {nodes.map((n) => (
            <Link key={n.node_id} href={`/nodes#${n.node_id}`} style={{ textDecoration: 'none' }}>
              <div className={styles.listItem}>
                <div className={styles.itemMain}>
                  <div className={styles.avatarMini}>
                    <Server size={10} />
                  </div>
                  <span className={styles.itemName}>{n.hospital_name || 'Hospital Node'}</span>
                </div>
                <div className={styles.itemControls}>
                  <div className={styles.dotsGroup}>
                    <span className={n.status === 'active' ? styles.dotGreen : styles.dotLight}></span>
                  </div>
                  <ChevronRight size={12} color="#666" />
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className={styles.listFooter}>
          <Link href="/nodes" className={styles.viewAllBtn} style={{ width: '100%', justifyContent: 'center' }}>
            View all directory <ChevronRight size={11} />
          </Link>
        </div>
      </div>

      {/* Network Overview Card */}
      <div className={styles.expandCard}>
        <div className={styles.expandHeader}>
          <span className={styles.progressSub}>participating nodes</span>
          <div className={styles.progressValue}>{nodes.length || 8}</div>
        </div>
        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: `${Math.min(100, (nodes.length || 8) * 15)}%` }}></div>
          <div className={styles.progressDot} style={{ left: `${Math.min(95, (nodes.length || 8) * 15)}%` }}></div>
        </div>
        <div className={styles.expandContent}>
          <h5 className={styles.expandTitle}>Global Aggregator</h5>
          <p className={styles.expandDesc}>Coordinate FedAvg rounds across local nodes</p>
        </div>
      </div>
    </div>
  );
}
