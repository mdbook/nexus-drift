export class Rng {
  private state: number;
  constructor(seed: number) { this.state = seed >>> 0 || 1; }
  next(): number {
    // Mulberry32
    this.state = (this.state + 0x6D2B79F5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(min: number, max: number): number { return min + this.next() * (max - min); }
  pick<T>(items: T[]): T { return items[Math.floor(this.next() * items.length)]; }
  chance(p: number): boolean { return this.next() < p; }
}
