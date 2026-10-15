import type Phaser from 'phaser';
import { HAVEN_GARRISON_FENCE,HAVEN_GARRISON_GATES } from '@empery/shared';
import { addPropFootprint } from './prop-colliders.js';
import { entityDepth } from './visual-polish.js';

/** Code-drawn wooden palisade uses the exact shared ground line for its bodies. */
export function placeGarrisonPalisade(scene: Phaser.Scene): void {
  const post=(x:number,y:number)=>{
    const g=scene.add.graphics().setDepth(entityDepth(y));
    g.fillStyle(0x000000,.18);g.fillEllipse(x+3,y+3,20,10);
    g.fillStyle(0x493222,1);g.fillRect(x-7,y-29,14,30);
    g.fillTriangle(x-7,y-29,x,y-39,x+7,y-29);
    g.fillStyle(0x8a6240,1);g.fillRect(x-5,y-27,5,27);
    g.lineStyle(1,0x2d2118,.6);g.lineBetween(x+3,y-26,x+3,y-2);
  };
  for(const [id,x,y,size] of HAVEN_GARRISON_FENCE){
    addPropFootprint(scene,id,x,y,size);
    if(id.endsWith('_h')){
      const g=scene.add.graphics().setDepth(entityDepth(y)-.001);
      g.fillStyle(0x3c2b20,1);g.fillRect(x-size/2,y-23,size,7);g.fillRect(x-size/2,y-7,size,7);
      for(let px=x-size/2;px<=x+size/2;px+=16)post(px,y);
    }else{
      for(let py=y-size/2;py<=y+size/2;py+=16)post(x,py);
    }
  }
  for(const gate of HAVEN_GARRISON_GATES){
    const banner=scene.add.graphics().setDepth(entityDepth(gate.y)+.01);
    const horizontal=gate.y===224||gate.y===1088;
    const px=gate.x+(horizontal?-108:-24),py=gate.y+(horizontal?0:-108);
    banner.lineStyle(4,0x75614d,1);banner.lineBetween(px,py,px,py-70);
    banner.fillStyle(0x842a2a,1);banner.fillRect(px+2,py-67,28,36);
    banner.fillTriangle(px+2,py-31,px+16,py-20,px+30,py-31);
    banner.lineStyle(2,0xe1c27c,1);banner.strokeRect(px+9,py-58,13,19);
  }
}
