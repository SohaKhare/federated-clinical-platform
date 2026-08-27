import { appendFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Response } from "express";

// backend-global/log.txt — three levels up from
// src/services/global-node-service/, both in the tsx dev entrypoint (runs
// straight from src/) and in the compiled dist/ output (mirrors the same
// depth), so this resolves the same way in both.
const LOG_FILE_PATH = fileURLToPath(new URL("../../../log.txt", import.meta.url));

const SEPARATOR = "----------";

// Bounded so a long-running server doesn't grow this without limit — the
// file on disk keeps the full history, this is only what a freshly
// connected /logging tab replays before switching to live tail.
const MAX_BUFFERED_LINES = 1000;

const buffer: string[] = [];
const subscribers = new Set<Response>();

// Chained rather than fired independently per call — a round produces
// several log lines within milliseconds of each other, and unserialized
// appendFile() calls race, letting lines land on disk out of the order
// they were logged in.
let writeQueue: Promise<void> = Promise.resolve();

function push(line: string): void {
  buffer.push(line);

  if (buffer.length > MAX_BUFFERED_LINES) {
    buffer.shift();
  }

  for (const res of subscribers) {
    res.write(`data: ${line}\n\n`);
  }

  // Best-effort persistence — a write failure shouldn't break round
  // processing, so this queue is never awaited by callers.
  writeQueue = writeQueue
    .then(() => appendFile(LOG_FILE_PATH, `${line}\n`))
    .catch((error) => {
      console.error("Failed to append to log.txt:", error);
    });
}

/** Logs one round-lifecycle event, timestamped, to the buffer/file/live subscribers. */
export function logRoundEvent(message: string): void {
  push(`[${new Date().toISOString()}] ${message}`);
}

/** Visual boundary between one round's events and the next. */
export function logRoundSeparator(): void {
  push(SEPARATOR);
}

/** Snapshot of the buffered lines, oldest first — for replay on new connections. */
export function getBufferedLogLines(): string[] {
  return [...buffer];
}

/** Registers an SSE response as a live subscriber; returns an unsubscribe function. */
export function subscribeToActivityLog(res: Response): () => void {
  subscribers.add(res);

  return () => {
    subscribers.delete(res);
  };
}
