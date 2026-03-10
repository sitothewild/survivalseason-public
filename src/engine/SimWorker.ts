// ─────────────────────────────────────────────────────────────
// engine/SimWorker.ts
// Web Worker entry point for running sim iterations off the main thread.
// Usage: new Worker(new URL('./SimWorker.ts', import.meta.url), { type: 'module' })
// ─────────────────────────────────────────────────────────────

import { runSimulation } from "./SimLoop";
import type { SimInput, SimResult } from "./types";

export interface WorkerMessage {
  type: "run";
  input: SimInput;
  id: number;
}

export interface WorkerResponse {
  type: "result" | "error";
  result?: SimResult;
  error?: string;
  id: number;
}

// Worker message handler
self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data;
  if (msg.type === "run") {
    try {
      // Reconstruct Set from array (Sets don't survive postMessage)
      if (msg.input.talents && Array.isArray((msg.input.talents as any).activeTalents)) {
        (msg.input.talents as any).activeTalents = new Set((msg.input.talents as any).activeTalents);
      }

      const result = runSimulation(msg.input);
      const response: WorkerResponse = { type: "result", result, id: msg.id };
      (self as any).postMessage(response);
    } catch (err) {
      const response: WorkerResponse = {
        type: "error",
        error: err instanceof Error ? err.message : String(err),
        id: msg.id,
      };
      (self as any).postMessage(response);
    }
  }
};
