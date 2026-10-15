import { describe, it, expect } from 'vitest';
import { QuadTree, SpatialEntity } from './QuadTree.js';

describe('QuadTree', () => {
  it('should insert and query entities', () => {
    const qt = new QuadTree({ x: 0, y: 0, width: 200, height: 200 }, 2);
    
    const e1: SpatialEntity = { id: '1', x: -50, y: -50, width: 10, height: 10 };
    const e2: SpatialEntity = { id: '2', x: 50, y: 50, width: 10, height: 10 };
    
    qt.insert(e1);
    qt.insert(e2);
    
    const found = qt.query({ x: -40, y: -40, width: 50, height: 50 });
    expect(found).toContain(e1);
    expect(found).not.toContain(e2);
  });
});
