/** Small binary heap for bounded navigation searches. */
export class MinHeap<T> {
  private values: T[] = [];
  constructor(private compare: (a: T, b: T) => number) {}
  get size(): number { return this.values.length; }
  push(value: T): void {
    let index = this.values.length;
    this.values.push(value);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.compare(this.values[parent]!, value) <= 0) break;
      this.values[index] = this.values[parent]!;
      index = parent;
    }
    this.values[index] = value;
  }
  pop(): T | undefined {
    const first = this.values[0], tail = this.values.pop();
    if (this.values.length === 0 || tail === undefined) return first;
    let index = 0;
    while (index * 2 + 1 < this.values.length) {
      let child = index * 2 + 1;
      if (child + 1 < this.values.length && this.compare(this.values[child + 1]!, this.values[child]!) < 0) child++;
      if (this.compare(tail, this.values[child]!) <= 0) break;
      this.values[index] = this.values[child]!;
      index = child;
    }
    this.values[index] = tail;
    return first;
  }
}
