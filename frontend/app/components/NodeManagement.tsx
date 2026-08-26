"use client";
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import styles from './PatientManagement.module.css';
import { Server, Play, ChevronRight, CheckCircle2, RefreshCw } from 'lucide-react';
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
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [loadData]);

  const latestRound = rounds.length > 0 ? rounds[0] : null;

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

  const recentNodes = nodes.slice(0, 4);

  return (
    <div className={styles.container}>
      {/* Federation Quick Actions Card */}
      <div className={styles.listSection}>
        <div className={styles.sectionHeader}>
          <h4 className={styles.listTitle}>
            Federation Control
          </h4>
          <Server size={16} color="#666" />
        </div>
        <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', margin: '0 0 0.5rem 0' }}>
          {latestRound ? `Round ${latestRound.round} · Status: ${latestRound.status}` : 'Coordinate distributed training'}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <button
            type="button"
            className={styles.addBtn}
            onClick={handleStartRound}
            disabled={working}
            style={{
              backgroundColor: 'var(--color-text-main)',
              color: '#fff',
              border: 'none',
              padding: '0.6rem',
              justifyContent: 'center',
              borderRadius: '12px'
            }}
          >
            <Play size={13} /> {working ? 'Initiating…' : 'Start Federated Round'}
          </button>
          {latestRound && latestRound.ready_nodes > 0 && latestRound.status !== 'completed' && (
            <button
              type="button"
              className={styles.addBtn}
              onClick={() => handleBroadcast(latestRound.round_id)}
              disabled={working}
              style={{
                backgroundColor: '#10b981',
                color: '#fff',
                border: 'none',
                padding: '0.6rem',
                justifyContent: 'center',
                borderRadius: '12px'
              }}
            >
              <CheckCircle2 size={13} /> Broadcast Weights
            </button>
          )}
        </div>
      </div>

      {/* Hospital Nodes List */}
      <div className={styles.listSection}>
        <div className={styles.sectionHeader}>
          <h4 className={styles.listTitle}>
            Hospitals <span>{nodes.length} connected</span>
          </h4>
          <button type="button" className={styles.quickAddBtn} onClick={loadData} title="Refresh nodes">
            <RefreshCw size={13} />
          </button>
        </div>

        <div className={styles.listItems}>
          {recentNodes.length === 0 && (
            <div className={styles.listItem}>
              <span className={styles.itemName}>No nodes registered yet</span>
            </div>
          )}
          {recentNodes.map((n) => (
            <Link key={n.node_id} href={`/nodes#${n.node_id}`} style={{ textDecoration: 'none' }}>
              <div className={styles.listItem}>
                <div className={styles.itemMain}>
                  <div className={styles.avatarMini}>
                    <Server size={11} />
                  </div>
                  <span className={styles.itemName}>{n.hospital_name || 'Hospital Node'}</span>
                </div>
                <div className={styles.itemControls}>
                  <div className={styles.dotsGroup}>
                    <span className={n.status === 'active' ? styles.dotGreen : styles.dotLight}></span>
                  </div>
                  <ChevronRight size={14} color="#666" />
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className={styles.listFooter}>
          <Link href="/nodes" className={styles.viewAllBtn}>
            View all nodes <ChevronRight size={12} />
          </Link>
          <button type="button" className={styles.addBtn} onClick={loadData}>
            Refresh <RefreshCw size={12} />
          </button>
        </div>
      </div>

      {/* Network Overview Card */}
      <div className={styles.expandCard}>
        <div className={styles.expandHeader}>
          <div className={styles.progressValue}>{nodes.length}</div>
          <span className={styles.progressSub}>participating hospitals</span>
        </div>
        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: `${Math.min(100, nodes.length * 25)}%` }}></div>
          <div className={styles.progressDot} style={{ left: `${Math.min(95, nodes.length * 25)}%` }}></div>
          <div className={styles.progressTrackDots}></div>
        </div>
        <div className={styles.expandContent}>
          <h5 className={styles.expandTitle}>Global Node Network</h5>
          <p className={styles.expandDesc}>Coordinating FedAvg rounds across local nodes</p>
          <Link href="/nodes" className={styles.viewAllBtn}>
            All hospital nodes <ChevronRight size={12} />
          </Link>
        </div>
      </div>
    </div>
  );
}
