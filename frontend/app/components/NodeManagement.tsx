"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from './PatientManagement.module.css';
import { Server, Play, ChevronRight, CheckCircle2, RefreshCw } from 'lucide-react';
import { api, type FederatedNode, type FederatedRoundSnapshot } from '@/lib/api';

export default function NodeManagement() {
  const [nodes, setNodes] = useState<FederatedNode[]>([]);
  const [rounds, setRounds] = useState<FederatedRoundSnapshot[]>([]);
  const [working, setWorking] = useState(false);
  const [actionMessage, setActionMessage] = useState('');

  const loadData = () => {
    api.getNodes().then(setNodes).catch(() => {});
    api.getFederatedRounds().then(setRounds).catch(() => {});
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  const latestRound = rounds.length > 0 ? rounds[0] : null;

  const handleStartRound = async () => {
    setWorking(true);
    setActionMessage('');
    try {
      await api.startGlobalRound();
      setActionMessage('New federated round initiated across active nodes.');
      loadData();
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Unable to start round.');
    } finally {
      setWorking(false);
    }
  };

  const handleBroadcast = async (roundId: string) => {
    setWorking(true);
    setActionMessage('');
    try {
      await api.broadcastGlobalWeights(roundId);
      setActionMessage('Global weights broadcasted to hospital nodes.');
      loadData();
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Broadcast failed.');
    } finally {
      setWorking(false);
    }
  };

  const recentNodes = nodes.slice(0, 4);

  return (
    <div className={styles.container}>
      {/* Federation Control Action Card */}
      <div className={styles.addPatientCard} style={{ cursor: 'default' }}>
        <div className={styles.cameraIcon}>
          <Server size={16} color="#666" />
        </div>

        <div className={styles.faceWireframe}>
          <div className={styles.headOutline} style={{ borderRadius: '16px' }}></div>
          <div className={styles.crosshair}></div>
        </div>

        <div className={styles.addContent}>
          <h4 className={styles.addTitle}>Federation Control</h4>
          <span className={styles.addSubtitle}>
            {latestRound ? `Round ${latestRound.round} · ${latestRound.status}` : 'Coordinate distributed training'}
          </span>
          <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
            <button
              type="button"
              className={styles.addBtn}
              onClick={handleStartRound}
              disabled={working}
              style={{ backgroundColor: 'var(--color-text-main)', color: '#fff', border: 'none' }}
            >
              <Play size={12} /> {working ? 'Running…' : 'Start round'}
            </button>
            {latestRound && latestRound.ready_nodes > 0 && latestRound.status !== 'completed' && (
              <button
                type="button"
                className={styles.addBtn}
                onClick={() => handleBroadcast(latestRound.round_id)}
                disabled={working}
              >
                <CheckCircle2 size={12} /> Broadcast
              </button>
            )}
          </div>
          {actionMessage && (
            <p style={{ fontSize: '0.7rem', color: '#2b5c56', marginTop: '0.5rem' }}>{actionMessage}</p>
          )}
        </div>
      </div>

      {/* Mini Node Avatars */}
      <div className={styles.miniAvatars}>
        <div className={styles.avatarsRow}>
          {recentNodes.slice(0, 3).map((n, i) => (
            <div
              key={n.node_id}
              className={styles.avatar}
              style={{ backgroundColor: ['#2b5c56', '#7e57c2', '#ec407a'][i % 3] }}
              title={n.hospital_name}
            ></div>
          ))}
          {recentNodes.length === 0 && <div className={styles.avatarDots}>…</div>}
        </div>
        <div className={styles.avatarsInfo}>
          <span className={styles.avatarsText}>
            {nodes.length} hospital node{nodes.length === 1 ? '' : 's'} registered
          </span>
          <Link href="/nodes" className={styles.viewAllBtn}>view all <ChevronRight size={12} /></Link>
        </div>
      </div>

      {/* Hospital Nodes List */}
      <div className={styles.listSection}>
        <h4 className={styles.listTitle}>Hospitals <span>{nodes.length} connected</span></h4>

        <div className={styles.listItems}>
          {recentNodes.length === 0 && (
            <div className={styles.listItem}>
              <span className={styles.itemName}>No nodes registered yet</span>
            </div>
          )}
          {recentNodes.map((n) => (
            <Link key={n.node_id} href={`/nodes#${n.node_id}`} style={{ textDecoration: 'none' }}>
              <div className={styles.listItem}>
                <span className={styles.itemName}>{n.hospital_name || 'Hospital Node'}</span>
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
          <Link href="/nodes" className={styles.viewAllBtn}>view all <ChevronRight size={12} /></Link>
          <div className={styles.addBtn} onClick={loadData}>
            refresh <RefreshCw size={12} />
          </div>
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
          <p className={styles.expandDesc}>Coordinating Flower FedAvg rounds across local nodes</p>
          <Link href="/nodes" className={styles.viewAllBtn}>All hospital nodes <ChevronRight size={12} /></Link>
        </div>
      </div>
    </div>
  );
}
