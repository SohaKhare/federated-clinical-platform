'use client';

import { useState } from 'react';
import type {
  ConditionPrediction,
  PatientPrediction,
  RiskBand,
} from '@/lib/api';
import styles from './RiskCard.module.css';

const BAND_CLASS: Record<RiskBand, string> = {
  low: styles.low,
  moderate: styles.moderate,
  high: styles.high,
};

const BAND_LABEL: Record<RiskBand, string> = {
  low: 'Low risk',
  moderate: 'Moderate risk',
  high: 'High risk',
};

const pct = (p: number) => `${(p * 100).toFixed(1)}%`;

const formatDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

function BandPill({ band }: { band: RiskBand }) {
  return (
    <span className={`${styles.pill} ${BAND_CLASS[band]}`}>
      <span className={styles.dot} />
      {BAND_LABEL[band]}
    </span>
  );
}

function FeatureChips({ features }: { features: ConditionPrediction['top_features'] }) {
  if (features.length === 0) {
    return <span className={styles.featVal}>No feature attribution available.</span>;
  }
  return (
    <div className={styles.features}>
      {features.map((f) => (
        <span key={f.feature} className={styles.feature} title={`contribution ${f.contribution}`}>
          <span className={f.direction === 'increases' ? styles.featUp : styles.featDown}>
            {f.direction === 'increases' ? '↑' : '↓'}
          </span>
          {f.label}
          <span className={styles.featVal}>· {f.value}</span>
        </span>
      ))}
    </div>
  );
}

function ConditionDetail({ prediction }: { prediction: ConditionPrediction }) {
  const { provided, total, defaulted } = prediction.data_completeness;
  return (
    <div className={styles.detail}>
      <div>
        <div className={styles.featuresLabel}>Top contributing factors</div>
        <FeatureChips features={prediction.top_features} />
      </div>
      <div className={styles.triage}>
        <span className={styles.triageLabel}>Suggested action</span>
        <span>{prediction.triage_action}</span>
      </div>
      <div className={styles.completeness}>
        <b>{provided}</b> of <b>{total}</b> inputs from the patient record
        {defaulted.length > 0 && ` · defaulted: ${defaulted.join(', ')}`}
      </div>
    </div>
  );
}

function PrimaryRisk({ prediction }: { prediction: ConditionPrediction }) {
  return (
    <div className={`${styles.primary} ${BAND_CLASS[prediction.band]}`}>
      <div className={styles.primaryTop}>
        <div>
          <div className={styles.condName}>{prediction.label}</div>
          <div className={styles.probRow}>
            <span className={styles.prob}>{pct(prediction.probability)}</span>
            <span className={styles.probLabel}>model probability</span>
          </div>
        </div>
        <BandPill band={prediction.band} />
      </div>
      <ConditionDetail prediction={prediction} />
    </div>
  );
}

function OtherCondition({ prediction }: { prediction: ConditionPrediction }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`${styles.row} ${BAND_CLASS[prediction.band]}`}>
      <button className={styles.rowHead} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}>▶</span>
        <span className={styles.rowName}>{prediction.label}</span>
        <BandPill band={prediction.band} />
        <span className={styles.rowProb}>{pct(prediction.probability)}</span>
      </button>
      {open && <ConditionDetail prediction={prediction} />}
    </div>
  );
}

export default function RiskCard({
  prediction,
  onRerun,
  rerunning,
}: {
  prediction: PatientPrediction;
  onRerun?: () => void;
  rerunning?: boolean;
}) {
  const predictions = [...prediction.predictions].sort((a, b) => b.probability - a.probability);
  const [primary, ...others] = predictions;

  if (!primary) {
    return <div className={styles.empty}>The model returned no conditions for this patient.</div>;
  }

  const window = prediction.history_window;

  return (
    <div className={styles.wrap}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>Risk assessment</h2>
        {onRerun && (
          <button className={styles.rerun} onClick={onRerun} disabled={rerunning}>
            {rerunning ? 'Running…' : 'Re-run'}
          </button>
        )}
      </div>

      <PrimaryRisk prediction={primary} />

      {others.length > 0 && (
        <div className={styles.others}>
          {others.map((p) => (
            <OtherCondition key={p.condition} prediction={p} />
          ))}
        </div>
      )}

      <div className={styles.meta}>
        <span>
          {window && window.entries > 0
            ? `Based on ${window.entries} visit${window.entries === 1 ? '' : 's'} · ${formatDate(
                window.from,
              )} – ${formatDate(window.to)}`
            : 'Based on the latest clinical snapshot'}
        </span>
        <span className={styles.provenance}>
          Model {prediction.model_version ?? 'local'}
          {prediction.regions_trained
            ? ` · trained across ${prediction.regions_trained} regions, no records shared`
            : ' · federated across hospitals, no records shared'}
        </span>
      </div>
    </div>
  );
}
