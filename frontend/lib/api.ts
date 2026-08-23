// Mock API Service for Local Node Endpoints

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

async function fetcher(endpoint: string, options: RequestInit = {}) {
  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include',
  });

  if (!res.ok) {
    throw new Error(await res.text() || 'An error occurred');
  }
  return res.json();
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  picture?: string;
  role: 'local' | 'global';
}

export const api = {
  // --- AUTH ---
  loginWithGoogle: () => {
    window.location.href = `${API_URL}/auth/google`;
  },
  logout: async () => {
    return fetcher('/auth/logout', { method: 'POST' });
  },
  getMe: async (): Promise<AuthUser> => {
    const data = await fetcher('/auth/me');
    return data.user;
  },
  getPresentationBatch: async () => {
    const response = await fetch(`${API_URL}/patients/presentation-batch`, { credentials: 'include' });
    if (!response.ok) throw new Error('Unable to load the presentation pool.');
    return response.json();
  },

  // --- PATIENTS ---
  getPatients: async () => {
    return fetcher('/api/patients', { method: 'GET' });
  },
  getPatientDetails: async (id: string) => {
    return { id, name: `Patient ${id}`, dob: '1980-01-01', conditions: ['Hypertension'] };
  },
  getPatientEvents: async (id: string) => {
    return [
      { date: '2026-08-22', type: 'Checkup', details: 'Regular screening' },
      { date: '2026-07-15', type: 'Lab', details: 'Bloodwork normal' }
    ];
  },

  // --- MODEL ---
  getModelInfo: async () => {
    return { version: 'v2.1.4', type: 'Federated XGBoost', parameters: 1450000 };
  },
  getModelMetrics: async () => {
    return { accuracy: 0.94, precision: 0.92, recall: 0.95, f1: 0.93 };
  },

  // --- FEDERATED ---
  getFederatedStatus: async () => {
    return { status: 'Training', connectedNodes: 12, uptime: '48h' };
  },
  getFederatedRound: async () => {
    return { currentRound: 42, totalRounds: 100, progress: 0.42 };
  },

  // --- PRIVACY ---
  getPrivacyStatus: async () => {
    return { mode: 'Differential Privacy', active: true };
  },
  getPrivacyBudget: async () => {
    return { epsilon: 1.5, remaining: 0.8, used: 0.7 };
  },

  // --- RESEARCH ---
  getResearchSummary: async () => {
    return { totalStudies: 4, activeTrials: 2, totalParticipants: 1204 };
  },
  getResearchInsights: async () => {
    return [
      { title: 'Treatment A Efficacy', description: 'Shows 20% improvement in recovery.' },
      { title: 'Risk Factor Correlation', description: 'Strong link identified in subset B.' }
    ];
  }
};
