// ─────────────────────────────────────────────────────────────
// engine/WorkerPool.ts
// Manages a pool of Web Workers for parallel sim execution.
// Falls back to main-thread execution if Workers unavailable.
// ─────────────────────────────────────────────────────────────

import { runSimulation } from "./SimLoop";
import type { SimInput, SimResult, StatWeightResult, HeroTree, FightStyle } from "./types";
import { buildSimInput, addStatRating, addPrimaryStat } from "./buildSimInput";
import type { WorkerMessage, WorkerResponse } from "./SimWorker";

export class WorkerPool {
  private workers: Worker[] = [];
  private available: Worker[] = [];
  private pending: Map<number, {
    resolve: (r: SimResult) => void;
    reject: (e: Error) => void;
  }> = new Map();
  private nextId = 0;
  private useWorkers: boolean;

  constructor(poolSize?: number) {
    const size = poolSize ?? Math.min(navigator.hardwareConcurrency ?? 2, 4);
    this.useWorkers = typeof Worker !== "undefined";

    if (this.useWorkers) {
      try {
        for (let i = 0; i < size; i++) {
          const worker = new Worker(
            new URL("./SimWorker.ts", import.meta.url),
            { type: "module" },
          );
          worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
            this.handleResponse(e.data, worker);
          };
          worker.onerror = (e) => {
            console.error("Worker error:", e);
          };
          this.workers.push(worker);
          this.available.push(worker);
        }
      } catch {
        // Worker creation failed — fall back to main thread
        this.useWorkers = false;
        this.workers = [];
        this.available = [];
      }
    }
  }

  /**
   * Run a simulation. Uses a worker if available, otherwise runs on main thread.
   */
  async runSim(input: SimInput): Promise<SimResult> {
    if (!this.useWorkers || this.workers.length === 0) {
      return this.runOnMainThread(input);
    }

    return new Promise((resolve, reject) => {
      const id = this.nextId++;

      // Serialize the Set to an array for postMessage
      const serializedInput = {
        ...input,
        talents: {
          ...input.talents,
          activeTalents: Array.from(input.talents.activeTalents),
        },
      };

      this.pending.set(id, { resolve, reject });

      if (this.available.length > 0) {
        const worker = this.available.pop()!;
        const msg: WorkerMessage = { type: "run", input: serializedInput as any, id };
        worker.postMessage(msg);
      } else {
        // All workers busy — queue until one frees up
        // For simplicity, run on main thread as fallback
        this.pending.delete(id);
        resolve(this.runOnMainThread(input));
      }
    });
  }

  /**
   * Compute sim-derived stat weights.
   * Uses common random numbers (same seed) for variance reduction.
   */
  async computeSimStatWeights(
    hero: HeroTree,
    fightStyle: FightStyle,
  ): Promise<StatWeightResult> {
    const baseInput = buildSimInput(hero, fightStyle, { iterations: 1000 });
    const baseDps = (await this.runSim(baseInput)).meanDps;

    const stats = ["crit", "haste", "mastery", "vers"] as const;
    const delta = 200;

    // Run stat deltas in parallel
    const deltaResults = await Promise.all(
      stats.map(async (stat) => {
        const modInput = addStatRating(baseInput, stat, delta);
        modInput.config.seed = baseInput.config.seed; // common random numbers
        const result = await this.runSim(modInput);
        return { stat, dpsPerRating: (result.meanDps - baseDps) / delta };
      }),
    );

    // Agility baseline
    const agiInput = addPrimaryStat(baseInput, "agility", delta);
    agiInput.config.seed = baseInput.config.seed;
    const agiResult = await this.runSim(agiInput);
    const agiWeight = (agiResult.meanDps - baseDps) / delta;

    const weights: Record<string, number> = { agility: agiWeight };
    for (const d of deltaResults) {
      weights[d.stat] = d.dpsPerRating;
    }

    return {
      baseDps,
      weights: {
        agility: agiWeight,
        crit: weights["crit"],
        haste: weights["haste"],
        mastery: weights["mastery"],
        vers: weights["vers"],
      },
      normalized: {
        agility: 1.0,
        crit: agiWeight > 0 ? weights["crit"] / agiWeight : 0,
        haste: agiWeight > 0 ? weights["haste"] / agiWeight : 0,
        mastery: agiWeight > 0 ? weights["mastery"] / agiWeight : 0,
        vers: agiWeight > 0 ? weights["vers"] / agiWeight : 0,
      },
    };
  }

  private runOnMainThread(input: SimInput): SimResult {
    return runSimulation(input);
  }

  private handleResponse(response: WorkerResponse, worker: Worker): void {
    const pending = this.pending.get(response.id);
    if (!pending) return;
    this.pending.delete(response.id);

    // Return worker to available pool
    this.available.push(worker);

    if (response.type === "result" && response.result) {
      pending.resolve(response.result);
    } else {
      pending.reject(new Error(response.error ?? "Unknown worker error"));
    }
  }

  /** Terminate all workers */
  destroy(): void {
    for (const w of this.workers) {
      w.terminate();
    }
    this.workers = [];
    this.available = [];
    this.pending.clear();
  }
}

// Singleton pool
let _pool: WorkerPool | null = null;

export function getWorkerPool(): WorkerPool {
  if (!_pool) {
    _pool = new WorkerPool();
  }
  return _pool;
}
