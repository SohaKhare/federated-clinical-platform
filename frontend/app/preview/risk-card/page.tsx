'use client';

/**
 * Design preview for the per-patient prediction screen. Renders the real page chrome and the
 * real RiskCard from fixtures, so the layout can be reviewed without a trained model, a running
 * backend, or a login. Not linked from the app — visit /preview/risk-card directly.
 *
 * The "future model" fixtures are also the de-facto spec for the multi-disease checkpoint:
 * whatever the Python service emits must deserialise into these same shapes.
 */

import { useState } from 'react';
import type { ConditionPrediction, PatientPrediction } from '@/lib/api';
import RiskCard from '../../components/RiskCard';
import shared from '../../components/SharedCards.module.css';

// --- conditions a multi-disease checkpoint might declare ---

const heart: ConditionPrediction = {
  condition: 'heart_disease',
  label: 'Coronary heart disease',
  probability: 0.782,
  band: 'high',
  triage_action: 'Refer to cardiology within 2 weeks; repeat lipid panel and ECG before the visit.',
  top_features: [
    { feature: 'thalach', label: 'Max heart rate', value: '109 bpm', contribution: 0.31, direction: 'increases' },
    { feature: 'oldpeak', label: 'ST depression', value: '2.4', contribution: 0.22, direction: 'increases' },
    { feature: 'chol', label: 'Cholesterol', value: '286 mg/dL', contribution: 0.14, direction: 'increases' },
    { feature: 'age', label: 'Age', value: '61', contribution: 0.09, direction: 'increases' },
    { feature: 'trestbps', label: 'Resting BP', value: '118 mmHg', contribution: 0.05, direction: 'lowers' },
  ],
  data_completeness: { provided: 11, total: 13, defaulted: ['slope', 'ca'] },
};

const diabetes: ConditionPrediction = {
  condition: 'type2_diabetes',
  label: 'Type 2 diabetes',
  probability: 0.634,
  band: 'high',
  triage_action: 'Order HbA1c this week; start structured lifestyle programme and review in 3 months.',
  top_features: [
    { feature: 'bmi', label: 'BMI', value: '31.2', contribution: 0.29, direction: 'increases' },
    { feature: 'glucose', label: 'Fasting glucose', value: '124 mg/dL', contribution: 0.24, direction: 'increases' },
    { feature: 'family_history', label: 'Family history', value: 'Yes', contribution: 0.11, direction: 'increases' },
    { feature: 'activity', label: 'Weekly activity', value: '150 min', contribution: 0.07, direction: 'lowers' },
  ],
  data_completeness: { provided: 9, total: 9, defaulted: [] },
};

const hypertension: ConditionPrediction = {
  condition: 'hypertension',
  label: 'Hypertension',
  probability: 0.441,
  band: 'moderate',
  triage_action: 'Ambulatory BP monitoring over 7 days; review antihypertensive at next visit.',
  top_features: [
    { feature: 'sbp', label: 'Systolic BP', value: '138 mmHg', contribution: 0.26, direction: 'increases' },
    { feature: 'bmi', label: 'BMI', value: '31.2', contribution: 0.12, direction: 'increases' },
    { feature: 'sodium', label: 'Dietary sodium', value: 'High', contribution: 0.1, direction: 'increases' },
  ],
  data_completeness: { provided: 7, total: 8, defaulted: ['dbp_trend'] },
};

const ckd: ConditionPrediction = {
  condition: 'ckd',
  label: 'Chronic kidney disease',
  probability: 0.187,
  band: 'low',
  triage_action: 'Annual eGFR and urine ACR; no change to current management.',
  top_features: [
    { feature: 'egfr', label: 'eGFR', value: '92 mL/min', contribution: 0.21, direction: 'lowers' },
    { feature: 'acr', label: 'Urine ACR', value: '18 mg/g', contribution: 0.09, direction: 'increases' },
  ],
  data_completeness: { provided: 6, total: 7, defaulted: ['creatinine_trend'] },
};

const copd: ConditionPrediction = {
  condition: 'copd',
  label: 'COPD',
  probability: 0.093,
  band: 'low',
  triage_action: 'No action beyond routine screening.',
  top_features: [
    { feature: 'smoking', label: 'Smoking status', value: 'Never', contribution: 0.18, direction: 'lowers' },
    { feature: 'fev1', label: 'FEV1 % predicted', value: '96%', contribution: 0.11, direction: 'lowers' },
  ],
  data_completeness: { provided: 5, total: 6, defaulted: ['exacerbations_12m'] },
};

const stroke: ConditionPrediction = {
  condition: 'stroke',
  label: 'Stroke (5-year)',
  probability: 0.264,
  band: 'moderate',
  triage_action: 'Confirm anticoagulation eligibility; carotid doppler if symptoms develop.',
  top_features: [
    { feature: 'afib', label: 'Atrial fibrillation', value: 'Paroxysmal', contribution: 0.23, direction: 'increases' },
    { feature: 'sbp', label: 'Systolic BP', value: '138 mmHg', contribution: 0.14, direction: 'increases' },
    { feature: 'ldl', label: 'LDL', value: '3.1 mmol/L', contribution: 0.08, direction: 'increases' },
  ],
  data_completeness: { provided: 8, total: 10, defaulted: ['carotid_stenosis', 'prior_tia'] },
};

const sparse: ConditionPrediction = {
  condition: 'heart_disease',
  label: 'Coronary heart disease',
  probability: 0.507,
  band: 'moderate',
  triage_action: 'Prediction based on limited data — collect missing vitals before acting on it.',
  top_features: [],
  data_completeness: {
    provided: 3,
    total: 13,
    defaulted: ['chol', 'thalach', 'oldpeak', 'slope', 'ca', 'thal', 'restecg', 'exang', 'fbs', 'cp'],
  },
};

const base = {
  patient_id: 'a1b2c3d4-0000-0000-0000-000000000000',
  generated_at: '2026-08-27T09:12:00.000Z',
  model_source: 'federated' as const,
};

const FIXTURES: Record<string, PatientPrediction> = {
  'Future model · 6 conditions': {
    ...base,
    model_version: 'fed-r12-multi',
    regions_trained: 5,
    history_window: { entries: 14, from: '2023-02-14T00:00:00.000Z', to: '2026-08-19T00:00:00.000Z' },
    predictions: [hypertension, diabetes, ckd, heart, copd, stroke],
  },
  'Future model · 3 conditions': {
    ...base,
    model_version: 'fed-r12-multi',
    regions_trained: 4,
    history_window: { entries: 9, from: '2024-05-02T00:00:00.000Z', to: '2026-08-19T00:00:00.000Z' },
    predictions: [diabetes, heart, ckd],
  },
  'Future model · all low risk': {
    ...base,
    model_version: 'fed-r12-multi',
    regions_trained: 5,
    history_window: { entries: 3, from: '2026-01-08T00:00:00.000Z', to: '2026-08-19T00:00:00.000Z' },
    predictions: [
      copd,
      ckd,
      { ...diabetes, probability: 0.121, band: 'low', triage_action: 'Routine follow-up in 12 months.' },
    ],
  },
  'Today · single condition': {
    ...base,
    model_version: 'local-r7',
    regions_trained: null,
    history_window: { entries: 6, from: '2024-11-03T00:00:00.000Z', to: '2026-08-19T00:00:00.000Z' },
    predictions: [heart],
  },
  'Sparse record / no attribution': {
    ...base,
    model_source: 'baseline',
    model_version: 'baseline',
    regions_trained: null,
    history_window: { entries: 0, from: null, to: null },
    predictions: [sparse],
  },
  'Empty (model returned nothing)': {
    ...base,
    model_version: 'local-r7',
    regions_trained: null,
    history_window: null,
    predictions: [],
  },
};

const NAMES = Object.keys(FIXTURES);

const PATIENT = { name: 'Margaret Whitfield', short_id: 'a1b2c3d4', age: 61, sex: 'F' as const };

export default function RiskCardPreviewPage() {
  const [name, setName] = useState(NAMES[0]);
  const [rerunning, setRerunning] = useState(false);

  // body is height:100vh/overflow:hidden, so the preview owns its own scroll container.
  const fakeRerun = () => {
    setRerunning(true);
    setTimeout(() => setRerunning(false), 900);
  };

  return (
    <div style={{ height: '100vh', overflowY: 'auto', background: 'var(--bg-dashboard)' }}>
      <div style={{ maxWidth: '58rem', margin: '0 auto', padding: '1.5rem 1.5rem 4rem' }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 0.9rem',
            marginBottom: '2rem',
            border: '1px dashed #dce8e5',
            borderRadius: 12,
            background: '#fafcfb',
          }}
        >
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#245d55', marginRight: '0.35rem' }}>
            MOCKUP · fake data, no model
          </span>
          {NAMES.map((n) => (
            <button
              key={n}
              onClick={() => setName(n)}
              style={{
                border: '1px solid #dce8e5',
                background: n === name ? '#245d55' : '#fff',
                color: n === name ? '#fff' : '#245d55',
                font: 'inherit',
                fontWeight: 600,
                fontSize: '0.78rem',
                padding: '0.4rem 0.8rem',
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              {n}
            </button>
          ))}
        </div>

        {/* Mirrors app/(dashboard)/patients/[id]/prediction/page.tsx */}
        <div className={shared.container}>
          <div className={shared.header}>
            <div>
              <p className={shared.subtitle} style={{ marginBottom: '0.35rem', color: '#245d55' }}>
                ← Back to patient
              </p>
              <h1 className={shared.title}>{PATIENT.name}</h1>
              <p className={shared.subtitle}>
                ID: #{PATIENT.short_id} | {PATIENT.age} yrs | {PATIENT.sex === 'F' ? 'Female' : 'Male'}
              </p>
            </div>
          </div>

          <RiskCard prediction={FIXTURES[name]} onRerun={fakeRerun} rerunning={rerunning} />
        </div>
      </div>
    </div>
  );
}
