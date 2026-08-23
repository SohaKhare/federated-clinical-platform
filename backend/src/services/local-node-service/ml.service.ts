import { env } from "../../config/env.js";
import type { LocalTrainingStartInput } from "../../interfaces/model/federation-round.interface.js";

export async function startLocalTraining(
  nodeId: string,
  roundId: string,
  round: number,
  input: LocalTrainingStartInput = {},
) {
  const response = await fetch(`${env.federatedUrl}/federation/runs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Federation-Key": env.federationSharedSecret,
    },
    body: JSON.stringify({
      node_id: nodeId,
      round_id: roundId,
      round,
      callback_url: `${env.backendUrl}/api/federated/rounds/${roundId}/callback`,
      config: input.config ?? {},
    }),
  });

  if (!response.ok) {
    throw new Error(`ML service returned status ${response.status}.`);
  }

  return response.json();
}

export async function startFederatedTraining(input: {
  roundId: string;
  round: number;
  nodeIds: string[];
}) {
  const response = await fetch(`${env.federatedUrl}/federation/runs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Federation-Key": env.federationSharedSecret,
    },
    body: JSON.stringify({
      round_id: input.roundId,
      round: input.round,
      node_ids: input.nodeIds,
      callback_url: `${env.backendUrl}/api/federated/rounds/${input.roundId}/callback`,
      config: { "num-server-rounds": 3 },
    }),
  });

  if (!response.ok) {
    throw new Error(`ML service returned status ${response.status}.`);
  }

  return response.json();
}
