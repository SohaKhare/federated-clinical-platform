import { getLogs as getLogsRecords } from "../../services/local-node-service/log.service.js";
import { LOG_DIRECTIONS, LOG_STATUSES, } from "../../interfaces/model/log.interface.js";
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 200;
export async function getLogs(req, res) {
    const filters = parseLogFilters(req.query);
    if (!filters) {
        return res.status(400).json({
            message: "Invalid query. direction must be 'outgoing' or 'incoming', status must be 'pending', 'confirmed', or 'failed', round must be a non-negative integer, page must be a positive integer, and pageSize must be a positive integer up to 200.",
        });
    }
    try {
        const nodeId = req.session.user.userId;
        const { logs, pagination } = await getLogsRecords(nodeId, filters);
        return res.json({ logs, pagination });
    }
    catch (error) {
        console.error("Log fetch error:", error);
        return res.status(500).json({
            message: "Unable to fetch logs.",
        });
    }
}
function parseLogFilters(query) {
    const { direction, status, round, page, pageSize } = query;
    if (direction !== undefined &&
        !LOG_DIRECTIONS.includes(direction)) {
        return null;
    }
    if (status !== undefined &&
        !LOG_STATUSES.includes(status)) {
        return null;
    }
    const parsedRound = parseNonNegativeInt(round);
    if (round !== undefined && parsedRound === null) {
        return null;
    }
    const parsedPage = page === undefined ? 1 : parsePositiveInt(page);
    if (parsedPage === null) {
        return null;
    }
    const parsedPageSize = pageSize === undefined ? DEFAULT_PAGE_SIZE : parsePositiveInt(pageSize);
    if (parsedPageSize === null || parsedPageSize > MAX_PAGE_SIZE) {
        return null;
    }
    return {
        ...(direction !== undefined ? { direction: direction } : {}),
        ...(status !== undefined ? { status: status } : {}),
        ...(parsedRound !== null && round !== undefined ? { round: parsedRound } : {}),
        page: parsedPage,
        pageSize: parsedPageSize,
    };
}
function parseNonNegativeInt(value) {
    if (typeof value !== "string" || !/^\d+$/.test(value)) {
        return null;
    }
    return Number(value);
}
function parsePositiveInt(value) {
    const parsed = parseNonNegativeInt(value);
    return parsed !== null && parsed > 0 ? parsed : null;
}
//# sourceMappingURL=log.controller.js.map