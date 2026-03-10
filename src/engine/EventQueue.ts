// ─────────────────────────────────────────────────────────────
// engine/EventQueue.ts
// Min-heap priority queue for deterministic sim event processing.
// Tie-breaking: tMs → priority → seq (monotonic insertion order).
// ─────────────────────────────────────────────────────────────

/** Event priority constants — lower number = higher priority. */
export const EventPriority = {
  AURA_EXPIRE:    1,
  DOT_TICK:       2,
  CAST_COMPLETE:  3,
  COOLDOWN_READY: 4,
  GCD_READY:      5,
  PROC_ROLL:      6,
  AUTO_ATTACK:    7,
  PET_ATTACK:     8,
  CAST_START:     9,
} as const;

export type EventPriorityValue = typeof EventPriority[keyof typeof EventPriority];

/** A simulation event. */
export interface SimEvent {
  /** Timestamp in milliseconds when the event fires. */
  tMs: number;
  /** Priority for tie-breaking (lower = processed first). */
  priority: EventPriorityValue;
  /** Event type tag for dispatch. */
  type: string;
  /** Arbitrary payload. */
  payload?: unknown;
}

/** Internal heap node with monotonic sequence for deterministic ordering. */
interface HeapEntry {
  event: SimEvent;
  seq: number;
}

/** Compare two heap entries. Returns negative if a should come first. */
function compare(a: HeapEntry, b: HeapEntry): number {
  if (a.event.tMs !== b.event.tMs) return a.event.tMs - b.event.tMs;
  if (a.event.priority !== b.event.priority) return a.event.priority - b.event.priority;
  return a.seq - b.seq;
}

export class EventQueue {
  private heap: HeapEntry[] = [];
  private seqCounter = 0;

  /** Number of events in the queue. */
  get size(): number {
    return this.heap.length;
  }

  /** Add an event to the queue. */
  enqueue(event: SimEvent): void {
    const entry: HeapEntry = { event, seq: this.seqCounter++ };
    this.heap.push(entry);
    this.siftUp(this.heap.length - 1);
  }

  /** Remove and return the next event (smallest tMs/priority/seq). */
  dequeue(): SimEvent | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.siftDown(0);
    }
    return top.event;
  }

  /** Look at the next event without removing it. */
  peek(): SimEvent | undefined {
    return this.heap[0]?.event;
  }

  /** Remove all events from the queue. */
  clear(): void {
    this.heap = [];
    this.seqCounter = 0;
  }

  /** Remove all events matching a predicate. */
  removeWhere(predicate: (e: SimEvent) => boolean): number {
    const before = this.heap.length;
    this.heap = this.heap.filter((entry) => !predicate(entry.event));
    // Rebuild heap after removal
    if (this.heap.length !== before) {
      this.buildHeap();
    }
    return before - this.heap.length;
  }

  // ── Heap operations ─────────────────────────────────────

  private siftUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (compare(this.heap[i], this.heap[parent]) < 0) {
        this.swap(i, parent);
        i = parent;
      } else {
        break;
      }
    }
  }

  private siftDown(i: number): void {
    const n = this.heap.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && compare(this.heap[left], this.heap[smallest]) < 0) {
        smallest = left;
      }
      if (right < n && compare(this.heap[right], this.heap[smallest]) < 0) {
        smallest = right;
      }
      if (smallest !== i) {
        this.swap(i, smallest);
        i = smallest;
      } else {
        break;
      }
    }
  }

  private buildHeap(): void {
    for (let i = (this.heap.length >> 1) - 1; i >= 0; i--) {
      this.siftDown(i);
    }
  }

  private swap(i: number, j: number): void {
    const tmp = this.heap[i];
    this.heap[i] = this.heap[j];
    this.heap[j] = tmp;
  }
}
