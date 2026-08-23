import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/prisma.js";
import type {
  FederatedNodePhase,
  FederatedRoundBroadcastInput,
  FederatedRoundCallbackInput,
  FederatedRoundPhase,
  FederatedRoundSnapshot,
  FederatedRoundStartInput,
} from "../../interfaces/model/federation-round.interface.js";

interface LocalHospitalRecord {
  userId: string;
  hospitalName: string | null;
  email: string;
  createdAt: Date;
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

const roundStore = new Map<string, RoundRecord>();
let nextRoundNumber: number | null = null;
let roundNumberInit: Promise<void> | null = null;

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

  roundStore.set(roundId, record);
  await persistRound(record);

  await prisma.$transaction(
    selectedHospitals.map((hospital) =>
      prisma.log.upsert({
        where: {
          nodeId_round_direction: {
            nodeId: hospital.userId,
            round,
            direction: "outgoing",
          },
        },
        create: {
          nodeId: hospital.userId,
          round,
          direction: "outgoing",
          status: "preparing",
          timestamp: now,
          metadata: roundMetadata(roundId, "starting", {
            hospitalName: hospital.hospitalName ?? "",
            targetCount: selectedHospitals.length,
          }),
        },
        update: {
          status: "preparing",
          timestamp: now,
          metadata: roundMetadata(roundId, "starting", {
            hospitalName: hospital.hospitalName ?? "",
            targetCount: selectedHospitals.length,
          }),
        },
      }),
    ),
  );

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

  await prisma.log.upsert({
    where: {
      nodeId_round_direction: {
        nodeId: input.nodeId,
        round: record.round,
        direction: "incoming",
      },
    },
    create: {
      nodeId: input.nodeId,
      round: record.round,
      direction: "incoming",
      status: "received",
      timestamp: now,
      metadata: roundMetadata(roundId, "received", payload as Prisma.InputJsonValue),
    },
    update: {
      status: "received",
      timestamp: now,
      metadata: roundMetadata(roundId, "received", payload as Prisma.InputJsonValue),
    },
  });

  await persistRound(record);

  return {
    message: "Training update received.",
    round: toSnapshot(record),
    node: toNodeSnapshot(node),
  };
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

    await prisma.log.upsert({
      where: {
        nodeId_round_direction: {
          nodeId,
          round: record.round,
          direction: "outgoing",
        },
      },
      create: {
        nodeId,
        round: record.round,
        direction: "outgoing",
        status: "synced",
        timestamp: now,
        metadata: roundMetadata(roundId, "broadcasted", payload as Prisma.InputJsonValue),
      },
      update: {
        status: "synced",
        timestamp: now,
        metadata: roundMetadata(roundId, "broadcasted", payload as Prisma.InputJsonValue),
      },
    });
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

  const persisted = await prisma.federatedRound.findUnique({
    where: { roundId },
  });

  return persisted
    ? (persisted.snapshot as unknown as FederatedRoundSnapshot)
    : null;
}

async function getRoundRecord(roundId: string): Promise<RoundRecord | null> {
  const inMemory = roundStore.get(roundId);

  if (inMemory) {
    return inMemory;
  }

  const persisted = await prisma.federatedRound.findUnique({
    where: { roundId },
  });

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

  await prisma.federatedRound.upsert({
    where: { roundId: record.roundId },
    create: {
      roundId: record.roundId,
      round: record.round,
      status: record.status,
      targetNodeIds: snapshot.target_node_ids as Prisma.InputJsonValue,
      snapshot: snapshot as unknown as Prisma.InputJsonValue,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    },
    update: {
      status: record.status,
      targetNodeIds: snapshot.target_node_ids as Prisma.InputJsonValue,
      snapshot: snapshot as unknown as Prisma.InputJsonValue,
      updatedAt: record.updatedAt,
    },
  });
}

async function getEligibleLocalHospitals(): Promise<LocalHospitalRecord[]> {
  return prisma.user.findMany({
    where: { role: "local", hospitalName: { not: null } },
    select: {
      userId: true,
      hospitalName: true,
      email: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });
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
    roundNumberInit = prisma.log.aggregate({ _max: { round: true } }).then((result) => {
      nextRoundNumber = (result._max.round ?? 0) + 1;
    });
  }

  await roundNumberInit;
  roundNumberInit = null;
}

function roundMetadata(
  roundId: string,
  phase: string,
  payload: Prisma.InputJsonValue,
): Prisma.InputJsonValue {
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
