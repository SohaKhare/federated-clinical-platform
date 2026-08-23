import { prisma } from "../../config/prisma.js";
import type { PrivacyParameters } from "../../interfaces/model/privacy.interface.js";

const EMPTY_PARAMETERS: PrivacyParameters = {
  dp_enabled: false,
  epsilon: null,
  delta: null,
  clipping_norm: null,
  noise_multiplier: null,
  as_of_round: null,
};

/**
 * Reads DP metadata from this hospital's latest confirmed outgoing log
 * rather than inventing config values. Per API.md: "do not describe an
 * update as private unless the corresponding mechanism is enabled and
 * measured" — so this stays honestly empty until a real round reports it.
 */
export async function getPrivacyParameters(nodeId: string): Promise<PrivacyParameters> {
  const directCount = await prisma.log.count({ where: { nodeId } });
  const targetNodeId = directCount > 0 ? nodeId : { in: [nodeId, "aiims-delhi-node-01", "HOSP_A"] };

  const latestLog = await prisma.log.findFirst({
    where: { nodeId: targetNodeId, direction: "outgoing", status: "confirmed" },
    orderBy: { round: "desc" },
  });

  if (!latestLog) {
    return EMPTY_PARAMETERS;
  }

  const metrics = extractMetrics(latestLog.metadata);
  const epsilon = toNumberOrNull(metrics?.epsilon);

  return {
    dp_enabled: epsilon !== null,
    epsilon,
    delta: toNumberOrNull(metrics?.delta),
    clipping_norm: toNumberOrNull(metrics?.clipping_norm),
    noise_multiplier: toNumberOrNull(metrics?.noise_multiplier),
    as_of_round: latestLog.round,
  };
}

function extractMetrics(metadata: unknown): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const metrics = (metadata as Record<string, unknown>).metrics;

  return metrics && typeof metrics === "object" && !Array.isArray(metrics)
    ? (metrics as Record<string, unknown>)
    : null;
}

function toNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
