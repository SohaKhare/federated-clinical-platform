// API client for the Federated Clinical Platform backend.
// All endpoints below are implemented in the backend (see backend/testing_io.md).

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function fetcher<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
    credentials: 'include',
  });

  let body: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    const message =
      (body && typeof body === 'object' && 'message' in body && typeof (body as { message: unknown }).message === 'string'
        ? (body as { message: string }).message
        : null) ?? `Request failed with status ${res.status}`;
    throw new ApiError(res.status, message);
  }

  return body as T;
}

function qs(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}

// ---------- Types ----------

export type UserRole = 'local' | 'global';

export interface AuthUser {
  userId: string;
  googleId: string;
  email: string;
  hospitalName?: string;
  picture?: string;
  node: UserRole;
  role: UserRole;
  onboarded: boolean;
}

export interface Geolocation {
  latitude: number;
  longitude: number;
}

export interface HealthConditions {
  bp?: string;
  sugar?: string;
  allergies?: string[];
  [key: string]: unknown;
}

export interface Patient {
  patient_id: string;
  name: string;
  age: number;
  sex: string;
  symptoms: string[];
  diagnosed_diseases: string[];
  health_conditions: HealthConditions;
  contributed_to_round: number | null;
  updated_at: string;
  created_at: string;
}

export interface NewPatientInput {
  name: string;
  age: number;
  sex: string;
  symptoms: string[];
  diagnosed_diseases: string[];
  health_conditions: HealthConditions;
}

export interface PatientUpdateInput {
  name?: string;
  age?: number;
  sex?: string;
  symptoms?: string[];
  diagnosed_diseases?: string[];
  health_conditions?: HealthConditions;
}

export type ClinicalEventType = 'treatment' | 'diagnosis' | 'observation' | string;

export interface PatientEvent {
  event_id: string;
  patient_id: string;
  event_type: ClinicalEventType;
  event_data: Record<string, unknown>;
  occurred_at: string;
  created_at: string;
}

export interface AddEventInput {
  eventType: ClinicalEventType;
  eventData: Record<string, unknown>;
  occurredAt?: string;
}

export interface LogMetadata {
  num_examples?: number;
  metrics?: {
    epsilon?: number;
    delta?: number;
    clipping_norm?: number;
    noise_multiplier?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export type LogStatus = 'pending' | 'confirmed' | 'failed' | 'preparing' | 'submitted' | 'received' | 'applied' | 'synced' | string;

export interface LogEntry {
  log_id: string;
  node_id: string;
  timestamp: string;
  direction: 'outgoing' | 'incoming';
  round: number;
  metadata: LogMetadata;
  status: LogStatus;
  created_at: string;
}

export interface LogsResponse {
  logs: LogEntry[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface FederationState {
  latest_round_seen: number;
  last_direction: 'outgoing' | 'incoming';
  last_status: 'pending' | 'confirmed' | 'failed';
  role: 'local' | 'global';
  hospitalName?: string;
  onboarded?: boolean;
}

export interface NodeStatus {
  node_id: string;
  hospital_name: string;
  status: 'registered' | 'active' | 'idle';
  federation_state: FederationState;
  last_activity_at: string | null;
}

export interface PrivacyParameters {
  dp_enabled: boolean;
  epsilon: number | null;
  delta: number | null;
  clipping_norm: number | null;
  noise_multiplier: number | null;
  as_of_round: number | null;
}

export interface ResearchSummary {
  total_patients: number;
  age: { average: number; min: number; max: number };
  sex_breakdown: Record<string, number>;
  top_diagnosed_diseases: Array<{ diagnosis: string; count: number }>;
  top_symptoms: Array<{ symptom: string; count: number }>;
  min_group_size: number;
}

export interface ResearchInsightAssociation {
  diagnosis: string;
  patient_count: number;
  common_symptoms: Array<{ symptom: string; count: number }>;
}

export interface ResearchInsights {
  associations: ResearchInsightAssociation[];
  min_group_size: number;
  note: string;
}

export interface LocalModelInfo {
  model_version: string | null;
  status: 'untrained' | 'training' | 'ready' | 'failed';
  last_trained_at: string | null;
  sample_count: number | null;
  latest_round: number | null;
}

export interface LocalModelRoundMetrics {
  round: number;
  direction: 'outgoing' | 'incoming';
  status: string;
  num_examples: number | null;
  train_loss: number | null;
  train_accuracy: number | null;
  eval_loss: number | null;
  eval_accuracy: number | null;
  recorded_at: string;
}

export interface LocalModelMetrics {
  latest_round: number | null;
  accuracy: number | null;
  loss: number | null;
  precision: number | null;
  recall: number | null;
  f1_score: number | null;
  rounds: LocalModelRoundMetrics[];
}

export interface FederatedNode {
  node_id: string;
  hospital_name: string;
  pincode: string;
  geolocation: Geolocation;
  contact_email: string;
  joined_at: string;
  last_activity_at: string | null;
  status: 'registered' | 'active' | 'idle';
}

export interface ParticipationRound {
  round: number;
  directions: string[];
  statuses: string[];
  exchanges: number;
  last_activity_at: string;
}

export interface NodeDetails extends Omit<FederatedNode, 'last_activity_at'> {
  updated_at?: string;
  last_activity_at?: string | null;
  participation_history: ParticipationRound[];
}

export interface NodeMetrics {
  node_id: string;
  hospital_name: string;
  total_exchanges: number;
  rounds_participated: number;
  exchanges_by_status: Record<string, number>;
  first_activity_at: string | null;
  last_activity_at: string | null;
}

export interface FederatedRoundSnapshot {
  round_id: string;
  round: number;
  status: string;
  target_node_ids: string[];
  nodes: unknown[];
  ready_nodes: number;
  synced_nodes: number;
}

// ---------- API ----------

export const api = {
  // --- AUTH ---
  loginWithGoogle: () => {
    // Full-page navigation to the backend OAuth entry point (cross-origin by design).
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `${API_URL}/auth/google`;
  },

  logout: async () => {
    return fetcher<{ message?: string }>('/auth/logout', { method: 'POST' });
  },

  /** Returns the session user, or null when not authenticated (401). */
  getMe: async (): Promise<AuthUser | null> => {
    try {
      const data = await fetcher<{ authenticated: boolean; user: AuthUser }>('/auth/me');
      return data.authenticated ? data.user : null;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },

  onboard: async (input: { hospitalName: string; pincode: string; geolocation: Geolocation }) => {
    const data = await fetcher<{ user: AuthUser }>('/auth/onboarding', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return data.user;
  },

  // --- PATIENTS ---
  getPatients: async () => {
    const res = await fetcher<{ patients: Patient[] }>('/patients', { method: 'GET' });
    return res.patients || [];
  },

  getPatient: async (id: string): Promise<Patient> => {
    const data = await fetcher<{ patient: Patient }>(`/patients/${id}`);
    return data.patient;
  },

  createPatient: async (input: NewPatientInput): Promise<Patient> => {
    const data = await fetcher<{ patient: Patient }>('/patients', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return data.patient;
  },

  updatePatient: async (id: string, input: PatientUpdateInput): Promise<Patient> => {
    const data = await fetcher<{ patient: Patient }>(`/patients/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
    return data.patient;
  },

  getPatientEvents: async (id: string): Promise<PatientEvent[]> => {
    const data = await fetcher<{ events: PatientEvent[] }>(`/patients/${id}/events`);
    return data.events;
  },

  addPatientEvent: async (id: string, input: AddEventInput): Promise<PatientEvent> => {
    const data = await fetcher<{ event: PatientEvent }>(`/patients/${id}/events`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return data.event;
  },

  getPresentationBatch: async (): Promise<{
    hospital_id: number;
    patients: Array<{
      source_row: number;
      age: number;
      sex: string;
      symptoms: string[];
      heart_disease: boolean;
    }>;
  }> => {
    return fetcher('/patients/presentation-batch');
  },

  // --- LOGS ---
  getLogs: async (params: { direction?: string; status?: string; round?: number; page?: number; pageSize?: number } = {}): Promise<LogsResponse> => {
    return fetcher<LogsResponse>(`/logs${qs(params)}`);
  },

  // --- MODEL ---
  getModelInfo: async (): Promise<LocalModelInfo> => {
    return fetcher<LocalModelInfo>('/model');
  },
  getModelMetrics: async (): Promise<LocalModelMetrics> => {
    return fetcher<LocalModelMetrics>('/model/metrics');
  },

  // --- FEDERATED (local node) ---
  getFederatedStatus: async (): Promise<NodeStatus> => {
    return fetcher<NodeStatus>('/federated/status');
  },

  startTraining: async (roundId: string, input: { round: number; config?: Record<string, unknown> }) => {
    return fetcher<unknown>(`/federated/rounds/${roundId}/start-training`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  // --- FEDERATED (global node) ---
  getGlobalRounds: async () => fetcher('/api/federated/rounds', { method: 'GET' }),
  startGlobalRound: async (targetNodeIds?: string[]) => fetcher('/api/federated/rounds/start', {
    method: 'POST',
    body: JSON.stringify(targetNodeIds ? { targetNodeIds } : {}),
  }),
  getGlobalRound: async (roundId: string) => fetcher(`/api/federated/rounds/${roundId}`, { method: 'GET' }),
  broadcastGlobalWeights: async (roundId: string) => fetcher(`/api/federated/rounds/${roundId}/broadcast`, {
    method: 'POST',
    body: JSON.stringify({ notes: 'Global Flower model broadcast to participating hospitals.' }),
  }),

  // --- PRIVACY ---
  getPrivacyParameters: async (): Promise<PrivacyParameters> => {
    return fetcher<PrivacyParameters>('/privacy/parameters');
  },

  // --- RESEARCH ---
  getResearchSummary: async (): Promise<ResearchSummary> => {
    return fetcher<ResearchSummary>('/research/summary');
  },

  getResearchInsights: async (): Promise<ResearchInsights> => {
    return fetcher<ResearchInsights>('/research/insights');
  },

  // --- GLOBAL NODE ---
  getNodes: async (): Promise<FederatedNode[]> => {
    const data = await fetcher<{ nodes: FederatedNode[] }>('/nodes');
    return data.nodes;
  },

  getNode: async (id: string): Promise<NodeDetails> => {
    const data = await fetcher<{ node: NodeDetails }>(`/nodes/${id}`);
    return data.node;
  },

  getNodeStatus: async (id: string): Promise<NodeStatus> => {
    return fetcher<NodeStatus>(`/nodes/${id}/status`);
  },

  getNodeMetrics: async (id: string): Promise<NodeMetrics> => {
    return fetcher<NodeMetrics>(`/nodes/${id}/metrics`);
  },

  // --- GLOBAL FEDERATED ROUNDS ---
  getFederatedRounds: async (): Promise<FederatedRoundSnapshot[]> => {
    const data = await fetcher<{ rounds: FederatedRoundSnapshot[] }>('/api/federated/rounds');
    return data.rounds;
  },

  getFederatedRound: async (roundId: string): Promise<FederatedRoundSnapshot> => {
    return fetcher<FederatedRoundSnapshot>(`/api/federated/rounds/${roundId}`);
  },
};
