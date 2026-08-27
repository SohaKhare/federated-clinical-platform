"use client";
import { useEffect, useMemo, useState } from 'react';
import styles from './nodes.module.css';
import { api, type FederatedNode, type NodeDetails } from '@/lib/api';
import { Search, Server, X } from 'lucide-react';

export default function NodesPage() {
  const [nodes, setNodes] = useState<FederatedNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [nodeDetail, setNodeDetail] = useState<NodeDetails | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // All state updates happen inside promise callbacks, so nothing mutates
  // state synchronously during render/effect bodies
  // (react-hooks/set-state-in-effect). `loading` initializes to true.
  const loadNodes = () => {
    return api
      .getNodes()
      .then((data) => setNodes(data))
      .catch((e) => {
        console.error('Failed to load nodes', e);
        setError(e instanceof Error ? e.message : 'Failed to load nodes');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadNodes();
  }, []);

  const openNodeDetail = async (nodeId: string) => {
    setSelectedNodeId(nodeId);
    setLoadingDetail(true);
    try {
      const data = await api.getNode(nodeId);
      setNodeDetail(data);
    } catch (e) {
      console.error('Failed to load node details', e);
    } finally {
      setLoadingDetail(false);
    }
  };

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return nodes.filter((n) => {
      if (statusFilter !== 'All' && (n.status || 'registered').toLowerCase() !== statusFilter.toLowerCase()) {
        return false;
      }
      if (!term) return true;
      return (
        (n.hospital_name && n.hospital_name.toLowerCase().includes(term)) ||
        n.node_id.toLowerCase().includes(term) ||
        (n.contact_email && n.contact_email.toLowerCase().includes(term)) ||
        (n.pincode && n.pincode.includes(term))
      );
    });
  }, [nodes, search, statusFilter]);

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return '—';
    const d = new Date(isoString);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const shortenId = (id: string) => id.slice(0, 8);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Hospital Nodes Directory</h1>
          <p className={styles.subtitle}>Explore and monitor all onboarded participating hospitals</p>
        </div>
      </div>

      <div className={styles.controls}>
        <div className={styles.searchWrapper}>
          <Search size={18} className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search by hospital name, node ID, email, pincode..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className={styles.filterSelect}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="All">All Statuses</option>
          <option value="active">Active</option>
          <option value="registered">Registered</option>
          <option value="idle">Idle</option>
        </select>
      </div>

      <div className={styles.resultsCount}>
        {loading ? 'Loading…' : error ? error : `${filtered.length} hospital node${filtered.length === 1 ? '' : 's'} found`}
      </div>

      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>NODE ID</th>
              <th>HOSPITAL NAME</th>
              <th>PINCODE</th>
              <th>CONTACT EMAIL</th>
              <th>STATUS</th>
              <th>JOINED</th>
              <th>LAST ACTIVITY</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7}>Loading hospital nodes…</td></tr>
            ) : !error && filtered.length === 0 ? (
              <tr><td colSpan={7}>No hospital nodes found.</td></tr>
            ) : (
              filtered.map((n) => (
                <tr key={n.node_id} onClick={() => openNodeDetail(n.node_id)} className={styles.row}>
                  <td className={styles.idCell}>
                    <span className={styles.nodeBadgeLink}>#{shortenId(n.node_id)}</span>
                  </td>
                  <td className={styles.fw500}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Server size={16} color="#666" />
                      {n.hospital_name || 'Hospital Node'}
                    </div>
                  </td>
                  <td>{n.pincode || '—'}</td>
                  <td className={styles.monoCell}>{n.contact_email || '—'}</td>
                  <td>
                    <span
                      className={`${styles.pillBadge} ${
                        n.status === 'active'
                          ? styles.pillActive
                          : n.status === 'idle'
                          ? styles.pillIdle
                          : styles.pillReg
                      }`}
                    >
                      {n.status || 'registered'}
                    </span>
                  </td>
                  <td className={styles.dateText}>{formatDate(n.joined_at)}</td>
                  <td className={styles.dateText}>{formatDate(n.last_activity_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Node Details Modal */}
      {selectedNodeId && (
        <div className={styles.modalOverlay} onClick={() => { setSelectedNodeId(null); setNodeDetail(null); }}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h2>{nodeDetail?.hospital_name || 'Hospital Node Details'}</h2>
                <p className={styles.modalSub}>{selectedNodeId}</p>
              </div>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => { setSelectedNodeId(null); setNodeDetail(null); }}
              >
                <X size={18} />
              </button>
            </div>

            {loadingDetail ? (
              <p style={{ padding: '2rem', textAlign: 'center' }}>Loading node details…</p>
            ) : nodeDetail ? (
              <div className={styles.modalBody}>
                <div className={styles.metricsGrid}>
                  <div className={styles.metricCard}>
                    <span className={styles.metricLabel}>Status</span>
                    <span className={styles.metricValue}>{nodeDetail.status}</span>
                  </div>
                  <div className={styles.metricCard}>
                    <span className={styles.metricLabel}>Pincode</span>
                    <span className={styles.metricValue}>{nodeDetail.pincode || '—'}</span>
                  </div>
                  <div className={styles.metricCard}>
                    <span className={styles.metricLabel}>Joined</span>
                    <span className={styles.metricValue}>{formatDate(nodeDetail.joined_at)}</span>
                  </div>
                  <div className={styles.metricCard}>
                    <span className={styles.metricLabel}>Rounds Participated</span>
                    <span className={styles.metricValue}>{nodeDetail.participation_history?.length ?? 0}</span>
                  </div>
                </div>

                <h3 style={{ marginTop: '1.5rem', marginBottom: '0.75rem', fontSize: '1rem' }}>
                  Participation History
                </h3>
                {nodeDetail.participation_history && nodeDetail.participation_history.length > 0 ? (
                  <table className={styles.innerTable}>
                    <thead>
                      <tr>
                        <th>Round</th>
                        <th>Exchanges</th>
                        <th>Directions</th>
                        <th>Statuses</th>
                        <th>Last Activity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nodeDetail.participation_history.map((h, i) => (
                        <tr key={i}>
                          <td>Round {h.round}</td>
                          <td>{h.exchanges}</td>
                          <td>{h.directions.join(', ')}</td>
                          <td>{h.statuses.join(', ')}</td>
                          <td>{formatDate(h.last_activity_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p style={{ fontSize: '0.85rem', color: '#888' }}>
                    No participation logs recorded for this node yet.
                  </p>
                )}
              </div>
            ) : (
              <p style={{ padding: '2rem' }}>Node information not available.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
