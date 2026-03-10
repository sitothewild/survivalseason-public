// ─────────────────────────────────────────────────────────────
// engine/FocusModel.ts
// Lazy-regen focus model. No scheduled tick events — focus is
// calculated on demand via updateFocus(nowMs).
// ─────────────────────────────────────────────────────────────

export interface FocusModelOptions {
  /** Base focus regeneration per second (default: 5). */
  baseRegenPerSec?: number;
  /** Maximum focus capacity (default: 100, 120 with Energetic Ally). */
  maxFocus?: number;
  /** Starting focus (default: maxFocus). */
  startFocus?: number;
  /** Current haste percentage as decimal (e.g. 0.20 for 20%). */
  hastePercent?: number;
}

export class FocusModel {
  private currentFocus: number;
  private lastUpdateMs: number;
  private baseRegenPerSec: number;
  private maxFocus: number;
  private hastePercent: number;

  constructor(options: FocusModelOptions = {}) {
    this.baseRegenPerSec = options.baseRegenPerSec ?? 5;
    this.maxFocus = options.maxFocus ?? 100;
    this.hastePercent = options.hastePercent ?? 0;
    this.currentFocus = options.startFocus ?? this.maxFocus;
    this.lastUpdateMs = 0;
  }

  /** Current effective regen rate (focus per second). */
  get regenPerSec(): number {
    return this.baseRegenPerSec * (1 + this.hastePercent);
  }

  /** Get current focus after updating to the given timestamp. */
  getFocus(nowMs: number): number {
    this.updateFocus(nowMs);
    return this.currentFocus;
  }

  /**
   * Update focus to the current timestamp via lazy regen.
   * Calculates regen since last update and applies it.
   */
  updateFocus(nowMs: number): void {
    if (nowMs <= this.lastUpdateMs) return;

    const elapsedSec = (nowMs - this.lastUpdateMs) / 1000;
    const regen = elapsedSec * this.regenPerSec;
    this.currentFocus = Math.min(this.maxFocus, this.currentFocus + regen);
    this.lastUpdateMs = nowMs;
  }

  /**
   * Check if we can afford a given focus cost at the given time.
   */
  canAfford(amount: number, nowMs: number): boolean {
    this.updateFocus(nowMs);
    return this.currentFocus >= amount;
  }

  /**
   * Spend focus. Updates to nowMs first, then subtracts.
   * @returns true if the spend was successful, false if insufficient focus.
   */
  spend(amount: number, nowMs: number): boolean {
    this.updateFocus(nowMs);
    if (this.currentFocus < amount) return false;
    this.currentFocus -= amount;
    return true;
  }

  /**
   * Add focus directly (e.g. from procs, abilities that generate focus).
   * Respects the cap.
   */
  add(amount: number, nowMs: number): void {
    this.updateFocus(nowMs);
    this.currentFocus = Math.min(this.maxFocus, this.currentFocus + amount);
  }

  /** Set haste percent (recalculates regen rate). */
  setHaste(hastePercent: number): void {
    this.hastePercent = hastePercent;
  }

  /** Set max focus (e.g. when Energetic Ally is talented). */
  setMaxFocus(max: number): void {
    this.maxFocus = max;
    if (this.currentFocus > max) this.currentFocus = max;
  }

  /** Reset to initial state. */
  reset(startFocus?: number): void {
    this.currentFocus = startFocus ?? this.maxFocus;
    this.lastUpdateMs = 0;
  }

  /** Snapshot for debugging. */
  snapshot(nowMs: number): { focus: number; regenPerSec: number; maxFocus: number } {
    this.updateFocus(nowMs);
    return {
      focus: Math.round(this.currentFocus * 1000) / 1000,
      regenPerSec: this.regenPerSec,
      maxFocus: this.maxFocus,
    };
  }
}
