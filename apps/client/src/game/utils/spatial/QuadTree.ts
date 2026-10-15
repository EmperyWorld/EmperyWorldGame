export interface SpatialEntity {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export class QuadTree<T extends SpatialEntity> {
  private bounds: { x: number; y: number; width: number; height: number };
  private capacity: number;
  private entities: T[] = [];
  private divided = false;
  private northWest?: QuadTree<T>;
  private northEast?: QuadTree<T>;
  private southWest?: QuadTree<T>;
  private southEast?: QuadTree<T>;

  constructor(bounds: { x: number; y: number; width: number; height: number }, capacity = 4) {
    this.bounds = bounds;
    this.capacity = capacity;
  }

  private subdivide() {
    const { x, y, width, height } = this.bounds;
    const w = width / 2;
    const h = height / 2;
    this.northWest = new QuadTree({ x: x - w / 2, y: y - h / 2, width: w, height: h }, this.capacity);
    this.northEast = new QuadTree({ x: x + w / 2, y: y - h / 2, width: w, height: h }, this.capacity);
    this.southWest = new QuadTree({ x: x - w / 2, y: y + h / 2, width: w, height: h }, this.capacity);
    this.southEast = new QuadTree({ x: x + w / 2, y: y + h / 2, width: w, height: h }, this.capacity);
    this.divided = true;
  }

  insert(entity: T): boolean {
    if (!this.contains(entity)) return false;

    if (this.entities.length < this.capacity && !this.divided) {
      this.entities.push(entity);
      return true;
    }

    if (!this.divided) this.subdivide();

    return (
      this.northWest!.insert(entity) ||
      this.northEast!.insert(entity) ||
      this.southWest!.insert(entity) ||
      this.southEast!.insert(entity)
    );
  }

  private contains(entity: T): boolean {
    const { x, y, width, height } = this.bounds;
    return (
      entity.x >= x - width / 2 &&
      entity.x <= x + width / 2 &&
      entity.y >= y - height / 2 &&
      entity.y <= y + height / 2
    );
  }

  query(range: { x: number; y: number; width: number; height: number }, found: T[] = []): T[] {
    const { x, y, width, height } = this.bounds;
    const rx = range.x;
    const ry = range.y;
    const rw = range.width / 2;
    const rh = range.height / 2;

    if (
      rx + rw < x - width / 2 ||
      rx - rw > x + width / 2 ||
      ry + rh < y - height / 2 ||
      ry - rh > y + height / 2
    ) {
      return found;
    }

    for (const entity of this.entities) {
      if (
        entity.x >= rx - rw &&
        entity.x <= rx + rw &&
        entity.y >= ry - rh &&
        entity.y <= ry + rh
      ) {
        found.push(entity);
      }
    }

    if (this.divided) {
      this.northWest!.query(range, found);
      this.northEast!.query(range, found);
      this.southWest!.query(range, found);
      this.southEast!.query(range, found);
    }

    return found;
  }

  clear() {
    this.entities = [];
    this.divided = false;
    this.northWest = undefined;
    this.northEast = undefined;
    this.southWest = undefined;
    this.southEast = undefined;
  }
}
