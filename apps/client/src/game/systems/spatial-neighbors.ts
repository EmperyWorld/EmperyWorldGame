/** Snapshot of local neighbors for order-independent crowd separation. */
export class SpatialNeighbors<T extends {x:number;y:number}> {
 private cells=new Map<string,T[]>();
 constructor(points:readonly T[],private cellSize:number){
  for(const point of points){const key=this.key(point.x,point.y),cell=this.cells.get(key)??[];cell.push(point);this.cells.set(key,cell);}
 }
 private key(x:number,y:number):string{return `${Math.floor(x/this.cellSize)}:${Math.floor(y/this.cellSize)}`;}
 nearby(point:T,radius:number):T[]{
  const found:T[]=[];
  for(let gy=Math.floor((point.y-radius)/this.cellSize);gy<=Math.floor((point.y+radius)/this.cellSize);gy++)for(let gx=Math.floor((point.x-radius)/this.cellSize);gx<=Math.floor((point.x+radius)/this.cellSize);gx++)for(const other of this.cells.get(`${gx}:${gy}`)??[]){
   if(other!==point&&(other.x-point.x)**2+(other.y-point.y)**2<radius**2)found.push(other);
  }
  return found;
 }
}
