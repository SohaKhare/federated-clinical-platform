// Mock API Service for Local Node Endpoints

export const api = {
  // --- AUTH ---
  login: async (credentials: any) => {
    return { token: 'mock-token', user: { name: 'Nika Meyer' } };
  },
  logout: async () => {
    return { success: true };
  },
  getMe: async () => {
    return { name: 'Nika Meyer', role: 'Researcher', email: 'name@example.com', hospitalId: '0' };
  },
  getPresentationBatch: async () => {
    const response = await fetch('http://localhost:5000/patients/presentation-batch', { credentials: 'include' });
    if (!response.ok) throw new Error('Unable to load the presentation pool.');
    return response.json();
  },

  // --- PATIENTS ---
  getPatients: async () => {
    return [
      { id: '1024', name: 'Patient A', risk: 'High', lastEvent: '2026-08-20' },
      { id: '1025', name: 'Patient B', risk: 'Low', lastEvent: '2026-08-21' },
      { id: '1026', name: 'Patient C', risk: 'Medium', lastEvent: '2026-08-22' },
      { id: '1027', name: 'Patient D', risk: 'Low', lastEvent: '2026-08-19' },
    ];
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
