"use client";
import { useEffect, useRef, useState } from "react";

// Deliberately not going through lib/api.ts's role-based BASE_URLS — this
// page is unauthenticated and always talks to the global backend, which is
// the only one that owns round lifecycle (see backend-global's
// activity-log.service.ts).
const GLOBAL_API_URL = process.env.NEXT_PUBLIC_GLOBAL_API_URL ?? "http://localhost:8010";
const MAX_LINES = 1000;

export default function LoggingPage() {
  const [lines, setLines] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const source = new EventSource(`${GLOBAL_API_URL}/global/activity/stream`);

    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = (event) => {
      setLines((prev) => {
        const next = [...prev, event.data as string];
        return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
      });
    };

    return () => source.close();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [lines]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0e0b",
        color: "#4ade80",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        fontSize: 13,
        lineHeight: 1.5,
        padding: "1rem 1.25rem",
        whiteSpace: "pre-wrap",
        wordBreak: "break-all",
      }}
    >
      <div style={{ color: "#6b7280", marginBottom: "0.75rem" }}>
        federated round activity — {connected ? "● live" : "○ reconnecting…"}
      </div>

      {lines.length === 0 && (
        <div style={{ color: "#6b7280" }}>waiting for the next federated round…</div>
      )}

      {lines.map((line, index) => (
        <div key={index}>{line === "----------" ? "─".repeat(60) : line}</div>
      ))}

      <div ref={bottomRef} />
    </div>
  );
}
