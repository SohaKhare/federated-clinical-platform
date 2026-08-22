import { prisma } from "../../config/prisma.js";
const ACTIVE_THRESHOLD_MS = 24 * 60 * 60 * 1000;
export async function getNodes() {
    const [users, logGroups] = await Promise.all([
        prisma.user.findMany({
            where: { role: "local", hospitalName: { not: null } },
            orderBy: { createdAt: "asc" },
        }),
        prisma.log.groupBy({
            by: ["nodeId"],
            _max: { timestamp: true },
        }),
    ]);
    const lastActivityByNode = new Map(logGroups.map((group) => [group.nodeId, group._max.timestamp]));
    return users.map((user) => toNodeSummary(user, lastActivityByNode.get(user.userId) ?? null));
}
export async function getNode(nodeId) {
    const user = await findHospitalUser(nodeId);
    if (!user) {
        return null;
    }
    const logs = await prisma.log.findMany({
        where: { nodeId },
        orderBy: [{ round: "asc" }, { timestamp: "asc" }],
    });
    return {
        node_id: user.userId,
        hospital_name: user.hospitalName ?? "",
        pincode: user.pincode,
        geolocation: toGeolocation(user.geolocation),
        contact_email: user.email,
        joined_at: toIso(user.createdAt),
        updated_at: toIso(user.updatedAt),
        status: deriveStatus(getLastActivity(logs)),
        participation_history: buildParticipationHistory(logs),
    };
}
export async function getNodeStatus(nodeId) {
    const [user, latestLog, roundAggregate] = await Promise.all([
        findHospitalUser(nodeId),
        prisma.log.findFirst({
            where: { nodeId },
            orderBy: { timestamp: "desc" },
        }),
        prisma.log.aggregate({ where: { nodeId }, _max: { round: true } }),
    ]);
    if (!user) {
        return null;
    }
    const lastActivityAt = latestLog?.timestamp ?? null;
    const federationState = {
        latest_round_seen: roundAggregate._max.round ?? null,
        last_direction: latestLog?.direction ?? null,
        last_status: latestLog?.status ?? null,
    };
    return {
        node_id: user.userId,
        hospital_name: user.hospitalName ?? "",
        status: deriveStatus(lastActivityAt),
        federation_state: federationState,
        last_activity_at: lastActivityAt ? toIso(lastActivityAt) : null,
    };
}
export async function getNodeMetrics(nodeId) {
    const [user, logs] = await Promise.all([
        findHospitalUser(nodeId),
        prisma.log.findMany({
            where: { nodeId },
            select: { round: true, status: true, timestamp: true },
            orderBy: { timestamp: "asc" },
        }),
    ]);
    if (!user) {
        return null;
    }
    const stats = buildLogStats(logs);
    return {
        node_id: user.userId,
        hospital_name: user.hospitalName ?? "",
        total_exchanges: stats.total,
        rounds_participated: stats.rounds.length,
        exchanges_by_status: stats.byStatus,
        first_activity_at: stats.firstActivityAt ? toIso(stats.firstActivityAt) : null,
        last_activity_at: stats.lastActivityAt ? toIso(stats.lastActivityAt) : null,
    };
}
async function findHospitalUser(nodeId) {
    const user = await prisma.user.findUnique({ where: { userId: nodeId } });
    if (!user || user.role !== "local" || !user.hospitalName) {
        return null;
    }
    return user;
}
function buildParticipationHistory(logs) {
    const roundsByNumber = new Map();
    for (const log of logs) {
        let entry = roundsByNumber.get(log.round);
        if (!entry) {
            entry = {
                directions: new Set(),
                statuses: new Set(),
                exchanges: 0,
                lastActivityAt: log.timestamp,
            };
            roundsByNumber.set(log.round, entry);
        }
        entry.directions.add(log.direction);
        entry.statuses.add(log.status);
        entry.exchanges += 1;
        if (log.timestamp > entry.lastActivityAt) {
            entry.lastActivityAt = log.timestamp;
        }
    }
    return [...roundsByNumber.entries()].map(([round, entry]) => ({
        round,
        directions: [...entry.directions],
        statuses: [...entry.statuses],
        exchanges: entry.exchanges,
        last_activity_at: toIso(entry.lastActivityAt),
    }));
}
function buildLogStats(logs) {
    const byStatus = {};
    const rounds = new Set();
    let firstActivityAt = null;
    let lastActivityAt = null;
    for (const log of logs) {
        byStatus[log.status] = (byStatus[log.status] ?? 0) + 1;
        rounds.add(log.round);
        firstActivityAt = firstActivityAt ?? log.timestamp;
        lastActivityAt = log.timestamp;
    }
    return {
        total: logs.length,
        byStatus,
        rounds: [...rounds],
        firstActivityAt,
        lastActivityAt,
    };
}
function toNodeSummary(user, lastActivityAt) {
    return {
        node_id: user.userId,
        hospital_name: user.hospitalName ?? "",
        pincode: user.pincode,
        geolocation: toGeolocation(user.geolocation),
        contact_email: user.email,
        joined_at: toIso(user.createdAt),
        last_activity_at: lastActivityAt ? toIso(lastActivityAt) : null,
        status: deriveStatus(lastActivityAt),
    };
}
function getLastActivity(logs) {
    return logs.at(-1)?.timestamp ?? null;
}
function deriveStatus(lastActivityAt) {
    if (!lastActivityAt) {
        return "registered";
    }
    const isActive = Date.now() - lastActivityAt.getTime() <= ACTIVE_THRESHOLD_MS;
    return isActive ? "active" : "idle";
}
function toGeolocation(value) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        return value;
    }
    return {};
}
function toIso(date) {
    return date.toISOString();
}
//# sourceMappingURL=node.service.js.map