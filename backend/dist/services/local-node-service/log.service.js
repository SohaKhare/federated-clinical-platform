import { prisma } from "../../config/prisma.js";
export async function getLogs(nodeId, filters) {
    const where = {
        nodeId,
        ...(filters.direction !== undefined ? { direction: filters.direction } : {}),
        ...(filters.status !== undefined ? { status: filters.status } : {}),
        ...(filters.round !== undefined ? { round: filters.round } : {}),
    };
    const [logs, total] = await Promise.all([
        prisma.log.findMany({
            where,
            orderBy: [{ round: "desc" }, { timestamp: "desc" }],
            take: filters.pageSize,
            skip: (filters.page - 1) * filters.pageSize,
        }),
        prisma.log.count({ where }),
    ]);
    return {
        logs: logs.map(toLog),
        pagination: {
            page: filters.page,
            pageSize: filters.pageSize,
            total,
            totalPages: Math.ceil(total / filters.pageSize),
        },
    };
}
function toLog(log) {
    return {
        log_id: log.logId,
        node_id: log.nodeId,
        timestamp: log.timestamp.toISOString(),
        direction: log.direction,
        round: log.round,
        metadata: (log.metadata ?? {}),
        status: log.status,
        created_at: log.createdAt.toISOString(),
    };
}
//# sourceMappingURL=log.service.js.map