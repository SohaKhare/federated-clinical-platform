'use client';

import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import styles from './global.module.css';

type Node = { node_id: string; hospital_name: string; status: string };
type Round = {
  round_id: string;
  round: number;
  status: string;
  target_node_ids: string[];
  ready_nodes: number;
  synced_nodes: number;
  nodes: Array<{ node_id: string; hospital_name: string; status: string }>;
};

export default function GlobalPage() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [current, setCurrent] = useState<Round | null>(null);
  const [message, setMessage] = useState('');
  const [working, setWorking] = useState(false);

  useEffect(() => {
    api.getNodes()
      .then((data) => setNodes(data))
      .catch((error) => setMessage(error.message));
  }, []);

  useEffect(() => {
    if (!current?.round_id || ['completed', 'partial', 'failed'].includes(current.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const data = await api.getGlobalRound(current.round_id) as { round: Round };
        if (data?.round) setCurrent(data.round);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Unable to read round status.');
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [current]);

  async function pullLocalUpdates() {
    setWorking(true);
    setMessage('Starting Flower FedAvg across local hospitals...');
    try {
      const data = await api.startGlobalRound() as { round: Round };
      if (data?.round) setCurrent(data.round);
      setMessage('Flower run started. Waiting for local updates.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to start Flower.');
    } finally {
      setWorking(false);
    }
  }

  async function broadcastWeights() {
    if (!current) return;
    setWorking(true);
    try {
      const data = await api.broadcastGlobalWeights(current.round_id) as { round: Round };
      if (data?.round) setCurrent(data.round);
      setMessage('Aggregated global weights broadcast to participating hospitals.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to broadcast weights.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>GLOBAL NODE</p>
          <h1>Federated control room</h1>
          <p>Pull hospital updates through Flower FedAvg and broadcast the new global model.</p>
        </div>
        <button className={styles.primary} onClick={pullLocalUpdates} disabled={working || Boolean(current && !['completed', 'partial', 'failed'].includes(current.status))}>
          {working ? 'Working...' : 'Pull updates & run Flower'}
        </button>
      </header>

      {message && <p className={styles.message}>{message}</p>}

      <section className={styles.cards}>
        <div className={styles.card}><span>Registered hospitals</span><strong>{nodes.length}</strong></div>
        <div className={styles.card}><span>Current round</span><strong>{current?.round ?? '—'}</strong></div>
        <div className={styles.card}><span>Updates received</span><strong>{current?.ready_nodes ?? 0} / {current?.target_node_ids.length ?? 0}</strong></div>
        <div className={styles.card}><span>Global status</span><strong>{current?.status ?? 'idle'}</strong></div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div><h2>Hospital participation</h2><p>Only model updates and metrics cross the global boundary.</p></div>
          {current && current.ready_nodes > 0 && current.status !== 'completed' && <button className={styles.secondary} onClick={broadcastWeights} disabled={working}>Broadcast global weights</button>}
        </div>
        <div className={styles.rows}>
          {(current?.nodes ?? nodes).map((node) => (
            <div className={styles.row} key={node.node_id}>
              <span>{node.hospital_name || 'Hospital node'}</span>
              <span className={styles.status}>{node.status}</span>
            </div>
          ))}
          {nodes.length === 0 && !current && <p>No onboarded local hospitals are available.</p>}
        </div>
      </section>
    </main>
  );
}
