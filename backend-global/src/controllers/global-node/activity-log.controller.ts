import type { Request, Response } from "express";

import {
  getBufferedLogLines,
  subscribeToActivityLog,
} from "../../services/global-node-service/activity-log.service.js";

// Deliberately unauthenticated (see routes/activity-log.routes.ts) — this
// only ever carries round-lifecycle text (round numbers, node ids,
// accuracy/loss), never patient data or model weights, so it's safe for the
// unauthenticated /logging page to read directly.
export function streamActivityLogController(req: Request, res: Response) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  // writeHead() only queues the response line/headers — Node doesn't put
  // them on the wire until the first write(). With an empty buffer (e.g. a
  // freshly started server, no rounds logged yet) that first write wouldn't
  // happen until either a live event or the 15s heartbeat below, leaving the
  // client's connection looking hung in the meantime.
  res.flushHeaders();

  for (const line of getBufferedLogLines()) {
    res.write(`data: ${line}\n\n`);
  }

  const unsubscribe = subscribeToActivityLog(res);

  // Keeps intermediate proxies/load balancers from closing an idle
  // connection, and lets a dead client get reaped instead of leaking a
  // subscriber forever.
  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  });
}
