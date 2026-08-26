import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { env } from "../../config/env.js";
import { supabase } from "../../config/supabase.js";
import type {
  FederatedNodePhase,
  FederatedRoundBroadcastInput,
  FederatedRoundCallbackInput,
  FederatedRoundPhase,
  FederatedRoundSnapshot,
  FederatedRoundStartInput,
} from "../../interfaces/model/federation-round.interface.js";
import type { Database } from "../../types/supabase.js";

interface LocalHospitalRecord {
  userId: string;
  hospitalName: string | null;
  email: string;
  createdAt: string;
}

interface RoundEvent {
  status: FederatedNodePhase;
  timestamp: Date;
  details?: string;
}

interface RoundNodeState {
  nodeId: string;
  hospitalName: string;
  status: FederatedNodePhase;
  events: RoundEvent[];
  updatePayload: unknown | null;
  metrics: Record<string, unknown> | null;
}

interface RoundRecord {
  roundId: string;
  round: number;
  status: FederatedRoundPhase;
  createdAt: Date;
  updatedAt: Date;
  targetNodeIds: string[];
  nodes: Map<string, RoundNodeState>;
}

interface RoundStartResult {
  message: string;
  round: FederatedRoundSnapshot;
}

interface RoundCallbackResult {
  message: string;
  round: FederatedRoundSnapshot;
  node: FederatedRoundSnapshot["nodes"][number];
}

interface RoundBroadcastResult {
  message: string;
  round: FederatedRoundSnapshot;
  broadcasted_nodes: string[];
  skipped_nodes: string[];
}

type FederatedRoundRow = Database["public"]["Tables"]["federated_rounds"]["Row"];

const roundStore = new Map<string, RoundRecord>();
let nextRoundNumber: number | null = null;
let roundNumberInit: PromiseLike<void> | null = null;

export async function startFederatedRound(
  input: FederatedRoundStartInput = {},
): Promise<RoundStartResult> {
  const hospitals = await getEligibleLocalHospitals();
  const selectedHospitals = selectHospitals(hospitals, input.targetNodeIds);

  if (selectedHospitals.length === 0) {
    throw new Error("No eligible local hospitals are available for a federated round.");
  }

  const round = await reserveRoundNumber();
  const roundId = randomUUID();
  const now = new Date();

  const record: RoundRecord = {
    roundId,
    round,
    status: "starting",
    createdAt: now,
    updatedAt: now,
    targetNodeIds: selectedHospitals.map((hospital) => hospital.userId),
    nodes: new Map(),
  };

  for (const hospital of selectedHospitals) {
    record.nodes.set(hospital.userId, {
      nodeId: hospital.userId,
      hospitalName: hospital.hospitalName ?? "",
      status: "preparing",
      events: [{ status: "preparing", timestamp: now, details: "Round started." }],
      updatePayload: null,
      metrics: null,
    });
  }

  for (const hospital of selectedHospitals) {
    const { error } = await supabase.from("logs").upsert(
      {
        node_id: hospital.userId,
        round,
        direction: "outgoing",
        status: "preparing",
        timestamp: now.toISOString(),
        metadata: roundMetadata(roundId, "starting", {
          hospitalName: hospital.hospitalName ?? "",
          targetCount: selectedHospitals.length,
        }),
      },
      { onConflict: "node_id,round,direction" },
    );

    if (error) {
      throw new Error(error.message);
    }
  }

  // Only make the round visible/persisted once the per-hospital logs have
  // actually been written, so a failed write can't leave an orphaned round
  // record with no matching logs.
  roundStore.set(roundId, record);
  await persistRound(record);

  return {
    message: "Federated round started.",
    round: toSnapshot(record),
  };
}

export async function recordFederatedCallback(
  roundId: string,
  input: FederatedRoundCallbackInput,
): Promise<RoundCallbackResult> {
  const record = await getRoundRecord(roundId);

  if (!record) {
    throw new Error("Round not found.");
  }

  const node = record.nodes.get(input.nodeId);

  if (!node) {
    throw new Error("This node is not part of the round.");
  }

  const now = new Date();
  const payload = {
    update: input.update ?? null,
    metrics: input.metrics ?? null,
    notes: input.notes ?? null,
    storage_path: input.storage_path ?? null,
  };

  node.events.push(
    { status: "submitted", timestamp: now, details: "Local training completed." },
    { status: "received", timestamp: now, details: "Global node accepted the update." },
  );
  node.status = "received";
  node.updatePayload = payload;
  node.metrics = input.metrics ?? null;
  record.status = record.status === "starting" ? "collecting" : record.status;
  record.updatedAt = now;

  await supabase
    .from("patients")
    .update({ contributed_to_round: record.round })
    .eq("hospital_id", input.nodeId)
    .is("contributed_to_round", null);

  const { error } = await supabase.from("logs").upsert(
    {
      node_id: input.nodeId,
      round: record.round,
      direction: "incoming",
      status: "received",
      timestamp: now.toISOString(),
      metadata: roundMetadata(roundId, "received", payload),
    },
    { onConflict: "node_id,round,direction" },
  );

  if (error) {
    throw new Error(error.message);
  }

  await persistRound(record);

  const allNodesReceived = [...record.nodes.values()].every(
    (candidate) => candidate.status === "received" || candidate.status === "submitted",
  );

  if (allNodesReceived) {
    try {
      await aggregateRound(record);
    } catch (aggregationError) {
      console.error(`Aggregation failed for round ${roundId}:`, aggregationError);
    }
  }

  return {
    message: "Training update received.",
    round: await getFederatedRoundSnapshot(roundId) ?? toSnapshot(record),
    node: toNodeSnapshot(node),
  };
}

/**
 * Every target node has checked in — download each one's model from Supabase
 * to a local temp file (backend and ML service share a filesystem here too),
 * hand the ML service just the local paths, then upload whatever it wrote
 * back as the round's aggregated model.
 */
async function aggregateRound(record: RoundRecord): Promise<void> {
  const nodes = [...record.nodes.values()];
  const tempDir = join(tmpdir(), "federated-aggregate", record.roundId);
  await mkdir(tempDir, { recursive: true });

  const modelPaths: string[] = [];
  const sampleCounts: number[] = [];

  for (const node of nodes) {
    const storagePath = extractStoragePath(node.updatePayload);

    if (!storagePath) {
      throw new Error(`Node ${node.nodeId} has no stored model for round ${record.roundId}.`);
    }

    const { data, error } = await supabase.storage.from("models").download(storagePath);

    if (error) {
      throw new Error(error.message);
    }

    const buffer = Buffer.from(await data.arrayBuffer());
    const localPath = join(tempDir, `${node.nodeId}.pt`);
    await writeFile(localPath, buffer);
    modelPaths.push(localPath);
    sampleCounts.push(extractNumExamples(node.metrics));
  }

  const response = await fetch(`${env.federatedUrl}/federation/aggregate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Federation-Key": env.federationSharedSecret,
    },
    body: JSON.stringify({ model_paths: modelPaths, sample_counts: sampleCounts }),
  });

  if (!response.ok) {
    throw new Error(`ML service returned status ${response.status} for aggregation.`);
  }

  const { output_path: outputPath } = (await response.json()) as { output_path: string };
  const aggregatedBuffer = await readFile(outputPath);

  const { error: uploadError } = await supabase.storage
    .from("models")
    .upload(`${record.roundId}/global.pt`, aggregatedBuffer, {
      contentType: "application/octet-stream",
      upsert: true,
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const globalStoragePath = `${record.roundId}/global.pt`;

  for (const nodeId of record.targetNodeIds) {
    try {
      const response = await fetch(`${env.localNodeUrl}/local/federated/rounds/${record.roundId}/model-ready`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Federation-Key": env.federationSharedSecret,
        },
        body: JSON.stringify({ storage_path: globalStoragePath }),
      });

      if (!response.ok) {
        throw new Error(`Local node returned status ${response.status}.`);
      }
    } catch (pushError) {
      console.error(`Failed to push model-ready to node ${nodeId}:`, pushError);
    }
  }

  await broadcastFederatedWeights(record.roundId, {});
}

function extractStoragePath(updatePayload: unknown): string | null {
  if (updatePayload && typeof updatePayload === "object" && "storage_path" in updatePayload) {
    const value = (updatePayload as Record<string, unknown>).storage_path;

    return typeof value === "string" ? value : null;
  }

  return null;
}

function extractNumExamples(metrics: Record<string, unknown> | null): number {
  const value = metrics?.num_examples;

  return typeof value === "number" && Number.isFinite(value) ? value : 1;
}

export async function broadcastFederatedWeights(
  roundId: string,
  input: FederatedRoundBroadcastInput = {},
): Promise<RoundBroadcastResult> {
  const record = await getRoundRecord(roundId);

  if (!record) {
    throw new Error("Round not found.");
  }

  const targetNodeIds = normalizeTargetNodeIds(input.nodeIds, record.targetNodeIds);
  const readyNodeIds = targetNodeIds.filter((nodeId) => {
    const node = record.nodes.get(nodeId);

    return node?.status === "received" || node?.status === "submitted";
  });

  if (readyNodeIds.length === 0) {
    throw new Error("No participating nodes have completed training yet.");
  }

  const now = new Date();
  const payload = {
    weights: input.weights ?? null,
    notes: input.notes ?? null,
  };

  record.status = "broadcasting";

  const broadcastedNodes: string[] = [];
  const skippedNodes: string[] = [];

  for (const nodeId of targetNodeIds) {
    const node = record.nodes.get(nodeId);

    if (!node) {
      skippedNodes.push(nodeId);
      continue;
    }

    if (node.status !== "received" && node.status !== "submitted") {
      skippedNodes.push(nodeId);
      continue;
    }

    node.events.push(
      { status: "broadcasting", timestamp: now, details: "Global weights are being delivered." },
      { status: "applied", timestamp: now, details: "Local node processed the broadcast." },
      { status: "synced", timestamp: now, details: "Local node is synchronized with the global model." },
    );
    node.status = "synced";
    node.updatePayload = payload;
    record.nodes.set(nodeId, node);
    broadcastedNodes.push(nodeId);

    const { error } = await supabase.from("logs").upsert(
      {
        node_id: nodeId,
        round: record.round,
        direction: "outgoing",
        status: "synced",
        timestamp: now.toISOString(),
        metadata: roundMetadata(roundId, "broadcasted", payload),
      },
      { onConflict: "node_id,round,direction" },
    );

    if (error) {
      throw new Error(error.message);
    }
  }

  record.status = broadcastedNodes.length === targetNodeIds.length ? "completed" : "partial";
  record.updatedAt = now;
  await persistRound(record);

  return {
    message: "Global weights broadcast completed.",
    round: toSnapshot(record),
    broadcasted_nodes: broadcastedNodes,
    skipped_nodes: skippedNodes,
  };
}

export async function getFederatedRoundSnapshot(
  roundId: string,
): Promise<FederatedRoundSnapshot | null> {
  const record = roundStore.get(roundId);

  if (record) {
    return toSnapshot(record);
  }

  const { data: persisted, error } = await supabase
    .from("federated_rounds")
    .select("*")
    .eq("round_id", roundId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return persisted ? (persisted.snapshot as unknown as FederatedRoundSnapshot) : null;
}

export async function getFederatedRoundSnapshots(): Promise<
  FederatedRoundSnapshot[]
> {
  const { data: persistedRounds, error } = await supabase
    .from("federated_rounds")
    .select("*")
    .order("round", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const snapshots = new Map(
    (persistedRounds ?? []).map((round: FederatedRoundRow) => [
      round.round_id,
      round.snapshot as unknown as FederatedRoundSnapshot,
    ]),
  );

  for (const record of roundStore.values()) {
    snapshots.set(record.roundId, toSnapshot(record));
  }

  return [...snapshots.values()].sort((left, right) => right.round - left.round);
}

async function getRoundRecord(roundId: string): Promise<RoundRecord | null> {
  const inMemory = roundStore.get(roundId);

  if (inMemory) {
    return inMemory;
  }

  const { data: persisted, error } = await supabase
    .from("federated_rounds")
    .select("*")
    .eq("round_id", roundId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!persisted) {
    return null;
  }

  const snapshot = persisted.snapshot as unknown as FederatedRoundSnapshot;
  const record: RoundRecord = {
    roundId: snapshot.round_id,
    round: snapshot.round,
    status: snapshot.status,
    createdAt: new Date(snapshot.created_at),
    updatedAt: new Date(snapshot.updated_at),
    targetNodeIds: snapshot.target_node_ids,
    nodes: new Map(
      snapshot.nodes.map((node) => [
        node.node_id,
        {
          nodeId: node.node_id,
          hospitalName: node.hospital_name,
          status: node.status,
          events: node.events.map((event) => ({
            ...event,
            timestamp: new Date(event.timestamp),
          })),
          updatePayload: null,
          metrics: null,
        },
      ]),
    ),
  };

  roundStore.set(roundId, record);

  return record;
}

async function persistRound(record: RoundRecord): Promise<void> {
  const snapshot = toSnapshot(record);

  const { error } = await supabase.from("federated_rounds").upsert(
    {
      round_id: record.roundId,
      round: record.round,
      status: record.status,
      target_node_ids: snapshot.target_node_ids,
      snapshot,
      created_at: record.createdAt.toISOString(),
      updated_at: record.updatedAt.toISOString(),
    },
    { onConflict: "round_id" },
  );

  if (error) {
    throw new Error(error.message);
  }
}

async function getEligibleLocalHospitals(): Promise<LocalHospitalRecord[]> {
  const { data, error } = await supabase
    .from("users")
    .select("user_id, hospital_name, email, created_at")
    .eq("role", "local")
    .not("hospital_name", "is", null)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((user) => ({
    userId: user.user_id,
    hospitalName: user.hospital_name,
    email: user.email,
    createdAt: user.created_at,
  }));
}

function selectHospitals(
  hospitals: LocalHospitalRecord[],
  targetNodeIds?: string[],
): LocalHospitalRecord[] {
  if (!targetNodeIds || targetNodeIds.length === 0) {
    return hospitals;
  }

  const uniqueTargetIds = [...new Set(targetNodeIds)];
  const selected = new Map(hospitals.map((hospital) => [hospital.userId, hospital]));
  const missing = uniqueTargetIds.filter((nodeId) => !selected.has(nodeId));

  if (missing.length > 0) {
    throw new Error(`Unknown local node(s): ${missing.join(", ")}`);
  }

  return uniqueTargetIds.map((nodeId) => selected.get(nodeId)).filter(
    (hospital): hospital is LocalHospitalRecord => hospital !== undefined,
  );
}

function normalizeTargetNodeIds(
  requestedIds: string[] | undefined,
  defaultIds: string[],
): string[] {
  if (!requestedIds || requestedIds.length === 0) {
    return [...new Set(defaultIds)];
  }

  return [...new Set(requestedIds)];
}

async function reserveRoundNumber(): Promise<number> {
  await ensureRoundNumberInitialized();

  const round = nextRoundNumber ?? 1;
  nextRoundNumber = round + 1;

  return round;
}

async function ensureRoundNumberInitialized(): Promise<void> {
  if (nextRoundNumber !== null) {
    return;
  }

  if (!roundNumberInit) {
    roundNumberInit = supabase
      .from("logs")
      .select("round")
      .order("round", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          throw new Error(error.message);
        }

        nextRoundNumber = (data?.round ?? 0) + 1;
      });
  }

  await roundNumberInit;
  roundNumberInit = null;
}

function roundMetadata(
  roundId: string,
  phase: string,
  payload: unknown,
): Record<string, unknown> {
  return {
    round_id: roundId,
    phase,
    payload,
  };
}

function toSnapshot(record: RoundRecord): FederatedRoundSnapshot {
  const nodes = [...record.nodes.values()].map(toNodeSnapshot);
  const readyNodes = nodes.filter((node) => node.status === "received").length;
  const syncedNodes = nodes.filter((node) => node.status === "synced").length;

  return {
    round_id: record.roundId,
    round: record.round,
    status: record.status,
    created_at: record.createdAt.toISOString(),
    updated_at: record.updatedAt.toISOString(),
    target_node_ids: [...record.targetNodeIds],
    nodes,
    ready_nodes: readyNodes,
    synced_nodes: syncedNodes,
  };
}

function toNodeSnapshot(node: RoundNodeState): FederatedRoundSnapshot["nodes"][number] {
  return {
    node_id: node.nodeId,
    hospital_name: node.hospitalName,
    status: node.status,
    last_event_at: node.events.at(-1)?.timestamp.toISOString() ?? null,
    events: node.events.map((event) => ({
      status: event.status,
      timestamp: event.timestamp.toISOString(),
      ...(event.details ? { details: event.details } : {}),
    })),
  };
}
