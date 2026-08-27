"use client";
import React, { useEffect, useState, useCallback } from 'react';
import styles from './logs.module.css';
import { Download, ChevronDown, ChevronUp, RefreshCw, Filter } from 'lucide-react';
import { api, type LogEntry, type FederatedNode } from '@/lib/api';
import { parseUtcIso } from '@/lib/time';
import { useAuth } from '@/lib/useAuth';

export default function LogsPage() {
  const { user } = useAuth();
  const isGlobal = user?.role === 'global';

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [nodes, setNodes] = useState<FederatedNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filters
  const [selectedNode, setSelectedNode] = useState<string>('All');
  const [directionFilter, setDirectionFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');

  useEffect(() => {
    if (isGlobal) {
      api.getNodes().then(setNodes).catch(() => {});
    }
  }, [isGlobal]);

  const fetchLogs = useCallback(() => {
    setLoading(true);
    const params: Record<string, string | number | undefined> = { pageSize: 100 };
    if (directionFilter !== 'All') params.direction = directionFilter;
    if (statusFilter !== 'All') params.status = statusFilter;

    const req = isGlobal && selectedNode !== 'All'
      ? api.getNodeLogs(selectedNode, params)
      : api.getLogs(params);

    req
      .then((data) => setLogs(data.logs))
      .catch((err) => console.error('Failed to load logs', err))
      .finally(() => setLoading(false));
  }, [isGlobal, selectedNode, directionFilter, statusFilter]);

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const formatTimestamp = (iso: string) => {
    // Supabase returns offset-less UTC strings; parseUtcIso tags them as UTC
    // so the Asia/Kolkata conversion below is actually applied.
    const d = parseUtcIso(iso);
    return d.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    });
  };

  // Render every time-like string on this page as IST — covers the main
  // timestamp column plus any ISO datetimes nested inside log metadata.
  const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?/;
  const formatValue = (value: unknown): string => {
    const str = String(value);
    return ISO_DATE_RE.test(str) && !isNaN(parseUtcIso(str).getTime())
      ? `${formatTimestamp(parseUtcIso(str).toISOString())} (IST)`
      : str;
  };

  const getNodeName = (nodeId: string) => {
    const found = nodes.find((n) => n.node_id === nodeId);
    return found?.hospital_name || nodeId.slice(0, 8);
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `exchange-logs-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{isGlobal ? 'Global Exchange Logs' : 'Data Exchange Logs'}</h1>
          <p className={styles.subtitle}>
            {loading ? 'Loading…' : `${logs.length} federation exchange${logs.length === 1 ? '' : 's'} recorded`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button className={styles.exportBtn} onClick={fetchLogs} style={{ backgroundColor: '#2a2a2a' }}>
            <RefreshCw size={16} /> Refresh
          </button>
          <button className={styles.exportBtn} onClick={exportJson} disabled={logs.length === 0}>
            <Download size={16} /> Export JSON
          </button>
        </div>
      </div>

      {/* Filter Controls */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.5rem' }}>
        {isGlobal && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Filter size={14} color="#888" />
            <select
              value={selectedNode}
              onChange={(e) => setSelectedNode(e.target.value)}
              style={{
                backgroundColor: '#1e1e1e',
                color: '#fff',
                border: '1px solid #333',
                borderRadius: '8px',
                padding: '0.4rem 0.8rem',
                fontSize: '0.85rem',
                outline: 'none',
              }}
            >
              <option value="All">All Hospital Nodes</option>
              {nodes.map((n) => (
                <option key={n.node_id} value={n.node_id}>
                  {n.hospital_name || n.node_id.slice(0, 8)}
                </option>
              ))}
            </select>
          </div>
        )}

        <select
          value={directionFilter}
          onChange={(e) => setDirectionFilter(e.target.value)}
          style={{
            backgroundColor: '#1e1e1e',
            color: '#fff',
            border: '1px solid #333',
            borderRadius: '8px',
            padding: '0.4rem 0.8rem',
            fontSize: '0.85rem',
            outline: 'none',
          }}
        >
          <option value="All">All Directions</option>
          <option value="outgoing">Outgoing</option>
          <option value="incoming">Incoming</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            backgroundColor: '#1e1e1e',
            color: '#fff',
            border: '1px solid #333',
            borderRadius: '8px',
            padding: '0.4rem 0.8rem',
            fontSize: '0.85rem',
            outline: 'none',
          }}
        >
          <option value="All">All Statuses</option>
          <option value="confirmed">Confirmed</option>
          <option value="synced">Synced</option>
          <option value="applied">Applied</option>
          <option value="submitted">Submitted</option>
          <option value="failed">Failed</option>
          <option value="pending">Pending</option>
        </select>
      </div>

      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Node ID / Hospital</th>
              <th>Direction</th>
              <th>Status</th>
              <th>Round</th>
              <th>Metadata</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6}>Loading logs…</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={6}>No exchange logs matching the selected filters.</td></tr>
            ) : (
              logs.map((log) => (
                <React.Fragment key={log.log_id}>
                  <tr className={styles.row} onClick={() => toggleExpand(log.log_id)}>
                    <td className={styles.mono}>{formatTimestamp(log.timestamp)}</td>
                    <td className={styles.nodeBadge}>
                      <span className={styles.badge} title={log.node_id}>
                        {isGlobal ? getNodeName(log.node_id) : log.node_id.slice(0, 8)}
                      </span>
                    </td>
                    <td className={log.direction === 'outgoing' ? styles.tx : styles.rx}>
                      {log.direction}
                    </td>
                    <td>
                      <span className={`${styles.badge} ${
                        log.status === 'confirmed' || log.status === 'synced' || log.status === 'applied' ? styles.statusConfirmed :
                        log.status === 'failed' ? styles.statusFailed :
                        styles.statusPending
                      }`}>
                        {log.status}
                      </span>
                    </td>
                    <td>{log.round}</td>
                    <td className={styles.metadataCell}>
                      {Object.keys(log.metadata).length > 0
                        ? JSON.stringify(log.metadata).slice(0, 60) + (JSON.stringify(log.metadata).length > 60 ? '…' : '')
                        : '{ }'}
                      {expandedId === log.log_id
                        ? <ChevronUp size={14} className={styles.chevron} />
                        : <ChevronDown size={14} className={styles.chevron} />}
                    </td>
                  </tr>
                  {expandedId === log.log_id && (
                    <tr className={styles.expandedRow}>
                      <td colSpan={6}>
                        <div className={styles.innerTableContainer}>
                          <table className={styles.innerTable}>
                            <tbody>
                              <tr>
                                <td className={styles.innerKey}>log_id</td>
                                <td className={styles.innerValue}>{log.log_id}</td>
                              </tr>
                              <tr>
                                <td className={styles.innerKey}>node_id</td>
                                <td className={styles.innerValue}>
                                  {log.node_id} ({getNodeName(log.node_id)})
                                </td>
                              </tr>
                              <tr>
                                <td className={styles.innerKey}>direction</td>
                                <td className={styles.innerValue}>{log.direction}</td>
                              </tr>
                              <tr>
                                <td className={styles.innerKey}>status</td>
                                <td className={styles.innerValue}>{log.status}</td>
                              </tr>
                              <tr>
                                <td className={styles.innerKey}>round</td>
                                <td className={styles.innerValue}>{log.round}</td>
                              </tr>
                              <tr>
                                <td className={styles.innerKey}>timestamp</td>
                                <td className={styles.innerValue}>{formatTimestamp(log.timestamp)} (IST)</td>
                              </tr>
                              {Object.entries(log.metadata).map(([key, value]) => (
                                <tr key={key}>
                                  <td className={styles.innerKey}>metadata.{key}</td>
                                  <td className={styles.innerValue}>
                                    {typeof value === 'object' && value !== null ? (
                                      <table className={styles.innerTable} style={{ marginTop: '0.5rem', marginBottom: '0.5rem', background: '#121212', borderRadius: '8px', padding: '0.5rem', display: 'block' }}>
                                        <tbody>
                                          {Object.entries(value as Record<string, unknown>).map(([subKey, subValue]) => (
                                            <tr key={subKey}>
                                              <td className={styles.innerKey} style={{ borderBottom: '1px dashed #222', padding: '0.5rem' }}>{subKey}</td>
                                              <td className={styles.innerValue} style={{ borderBottom: '1px dashed #222', padding: '0.5rem', color: '#a3be8c', fontFamily: 'monospace' }}>
                                                {formatValue(subValue)}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    ) : (
                                      formatValue(value)
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
