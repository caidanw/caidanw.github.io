/**
 * A fixed-capacity ring buffer that overwrites oldest elements when full.
 * Provides O(1) push and iteration without array resizing.
 */
export class RingBuffer<T> {
  private buffer: (T | undefined)[]
  private head = 0
  private count = 0

  constructor(public readonly capacity: number) {
    this.buffer = new Array(capacity)
  }

  get length(): number {
    return this.count
  }

  push(item: T): void {
    this.buffer[this.head] = item
    this.head = (this.head + 1) % this.capacity
    if (this.count < this.capacity) this.count++
  }

  clear(): void {
    this.head = 0
    this.count = 0
    this.buffer.fill(undefined)
  }

  /** Iterate from oldest to newest */
  *[Symbol.iterator](): Iterator<T> {
    if (this.count === 0) return
    const start = this.count < this.capacity ? 0 : this.head
    for (let i = 0; i < this.count; i++) {
      yield this.buffer[(start + i) % this.capacity] as T
    }
  }

  /** Get item at index (0 = oldest) */
  at(index: number): T | undefined {
    if (index < 0 || index >= this.count) return undefined
    const start = this.count < this.capacity ? 0 : this.head
    return this.buffer[(start + index) % this.capacity]
  }

  /** Convert to array (oldest to newest) */
  toArray(): T[] {
    return [...this]
  }
}
