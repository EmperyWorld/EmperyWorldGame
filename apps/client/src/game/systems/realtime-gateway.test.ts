import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RealtimeGateway } from './RealtimeGateway.js';
import { PlayerMotion } from '../controllers/player-motion.js';
import { CollisionWorld } from '@empery/shared/world-collision';
import { MOVEMENT_PROTOCOL } from '@empery/shared/movement';

type Listener = (event?: unknown) => void;

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  static instances: MockWebSocket[] = [];

  readonly url: string;
  readyState = MockWebSocket.CONNECTING;
  bufferedAmount = 0;
  sent: string[] = [];
  private readonly listeners = new Map<string, Listener[]>();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: Listener): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  send(payload: string): void { this.sent.push(payload); }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
  }

  emit(type: string, event?: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  static reset(): void {
    MockWebSocket.instances.length = 0;
  }
}

describe('RealtimeGateway reconnect guards', () => {
  it('ignores close from stale socket after reconnect', () => {
    vi.useFakeTimers();
    const prevWs = (globalThis as { WebSocket?: unknown }).WebSocket;
    const prevWindow = (globalThis as { window?: Window & typeof globalThis }).window;
    try {
      (globalThis as { WebSocket?: unknown }).WebSocket = MockWebSocket as unknown as typeof WebSocket;
      (globalThis as { window?: Window & typeof globalThis }).window = {
        location: { protocol: 'http:', host: 'localhost:3000' },
      } as Window & typeof globalThis;

      MockWebSocket.reset();
      const gateway = new RealtimeGateway();

      gateway.connect('save-1', 'empery_haven');
      const first = MockWebSocket.instances[0]!;
      first.readyState = MockWebSocket.OPEN;
      gateway.connect('save-1', 'empery_haven');
      const second = MockWebSocket.instances[1]!;
      second.readyState = MockWebSocket.OPEN;

      first.emit('close');
      vi.advanceTimersByTime(20_000);

      expect(MockWebSocket.instances).toHaveLength(2);
      expect(MockWebSocket.instances[1]).toBe(second);
    } finally {
      vi.useRealTimers();
      (globalThis as { WebSocket?: unknown }).WebSocket = prevWs;
      (globalThis as { window?: Window & typeof globalThis }).window = prevWindow;
    }
  });

  it('stops reconnect loop after SESSION_REPLACED error', () => {
    vi.useFakeTimers();
    const prevWs = (globalThis as { WebSocket?: unknown }).WebSocket;
    const prevWindow = (globalThis as { window?: Window & typeof globalThis }).window;
    try {
      (globalThis as { WebSocket?: unknown }).WebSocket = MockWebSocket as unknown as typeof WebSocket;
      (globalThis as { window?: Window & typeof globalThis }).window = {
        location: { protocol: 'http:', host: 'localhost:3000' },
      } as Window & typeof globalThis;

      MockWebSocket.reset();
      const gateway = new RealtimeGateway();
      gateway.connect('save-1', 'empery_haven');
      const first = MockWebSocket.instances[0]!;
      first.readyState = MockWebSocket.OPEN;

      first.emit('message', {
        data: JSON.stringify({
          type: 'error',
          error: 'Персонаж зашёл с другого клиента',
          code: 'SESSION_REPLACED',
        }),
      });
      first.emit('close');
      vi.advanceTimersByTime(20_000);

      expect(MockWebSocket.instances).toHaveLength(1);
    } finally {
      vi.useRealTimers();
      (globalThis as { WebSocket?: unknown }).WebSocket = prevWs;
      (globalThis as { window?: Window & typeof globalThis }).window = prevWindow;
    }
  });
  it('reconciles acknowledged predictions once and rejects stale or foreign snapshots',()=>{
    const prevWs=globalThis.WebSocket,prevWindow=globalThis.window;
    try{
      globalThis.WebSocket=MockWebSocket as unknown as typeof WebSocket;
      globalThis.window={location:{protocol:'http:',host:'localhost:3000'}} as Window & typeof globalThis;
      MockWebSocket.reset();const gateway=new RealtimeGateway();gateway.connect('save-1','adena_fields');MockWebSocket.instances[0]!.readyState=MockWebSocket.OPEN;
      MockWebSocket.instances[0]!.emit('message',{data:JSON.stringify({type:'welcome',payload:{protocolVersion:MOVEMENT_PROTOCOL,self:{locationId:'adena_fields',x:90,y:100}}})});
      gateway.sendMovement({dx:1,dy:0},{x:100,y:100});gateway.sendMovement({dx:1,dy:0},{x:110,y:100});
      const snapshot={locationId:'adena_fields',x:95,y:100,ack:1,serverTime:1,moving:true};
      expect(gateway.reconcile(snapshot,{x:110,y:100})).toEqual({x:105,y:100});gateway.applyPredictionCorrection(-5,0);
      expect(gateway.reconcile(snapshot,{x:105,y:100})).toEqual({x:105,y:100});
      expect(gateway.reconcile({...snapshot,ack:0},{x:105,y:100})).toBeNull();
      expect(gateway.reconcile({...snapshot,locationId:'silverwood'},{x:105,y:100})).toBeNull();gateway.disconnect();
    }finally{globalThis.WebSocket=prevWs;globalThis.window=prevWindow;}
  });
  it.each([0,150,350])('preserves the pending trajectory when acknowledgements lag by %i ms',delayMs=>{
    const prevWs=globalThis.WebSocket,prevWindow=globalThis.window;
    try{
      globalThis.WebSocket=MockWebSocket as unknown as typeof WebSocket;
      globalThis.window={location:{protocol:'http:',host:'localhost:3000'}} as Window & typeof globalThis;
      MockWebSocket.reset();const gateway=new RealtimeGateway();gateway.connect('save-1','adena_fields');
      const socket=MockWebSocket.instances[0]!;socket.readyState=MockWebSocket.OPEN;
      socket.emit('message',{data:JSON.stringify({type:'welcome',payload:{protocolVersion:MOVEMENT_PROTOCOL,self:{locationId:'adena_fields',x:100,y:100}}})});
      for(let seq=1;seq<=20;seq++){
        const current={x:100+seq*10,y:100};gateway.sendMovement({dx:1,dy:0},current);
        const ack=Math.max(0,seq-delayMs/50);
        expect(gateway.reconcile({locationId:'adena_fields',x:100+ack*10,y:100,ack,serverTime:seq*50,moving:ack>0},current)).toEqual(current);
      }
      gateway.disconnect();
    }finally{globalThis.WebSocket=prevWs;globalThis.window=prevWindow;}
  });
  it.each([undefined,2,3])('rejects unsupported movement protocol %s with a refresh instruction',version=>{
    const prevWs=globalThis.WebSocket,prevWindow=globalThis.window;
    try{
      globalThis.WebSocket=MockWebSocket as unknown as typeof WebSocket;
      globalThis.window={location:{protocol:'http:',host:'localhost:3000'}} as Window & typeof globalThis;
      MockWebSocket.reset();const onError=vi.fn(),gateway=new RealtimeGateway({onError});gateway.connect('save-1','adena_fields');
      const socket=MockWebSocket.instances[0]!;socket.readyState=MockWebSocket.OPEN;
      socket.emit('message',{data:JSON.stringify({type:'welcome',payload:{protocolVersion:version,self:{locationId:'adena_fields',x:100,y:100}}})});
      expect(socket.readyState).toBe(MockWebSocket.CLOSED);
      expect(onError).toHaveBeenCalledWith(expect.stringContaining('Обновите страницу'));
      gateway.disconnect();
    }finally{globalThis.WebSocket=prevWs;globalThis.window=prevWindow;}
  });
  it('waits for welcome and preserves unacknowledged movement relative to the initial server pose',()=>{
    const prevWs=globalThis.WebSocket,prevWindow=globalThis.window;
    try{
      globalThis.WebSocket=MockWebSocket as unknown as typeof WebSocket;
      globalThis.window={location:{protocol:'http:',host:'localhost:3000'}} as Window & typeof globalThis;
      MockWebSocket.reset();const gateway=new RealtimeGateway();gateway.connect('save-1','adena_fields');
      const socket=MockWebSocket.instances[0]!;socket.readyState=MockWebSocket.OPEN;
      gateway.sendMovement({dx:1,dy:0},{x:110,y:100});
      expect(gateway['predictions'].size).toBe(0);
      socket.emit('message',{data:JSON.stringify({type:'welcome',payload:{protocolVersion:MOVEMENT_PROTOCOL,self:{locationId:'adena_fields',x:100,y:100}}})});
      gateway.sendMovement({dx:1,dy:0},{x:110,y:100});
      const initial={locationId:'adena_fields',x:100,y:100,ack:0,serverTime:1,moving:false};
      expect(gateway.reconcile(initial,{x:110,y:100})).toEqual({x:110,y:100});
      expect(gateway.reconcile({...initial,ack:1,x:110},{x:110,y:100})).toEqual({x:110,y:100});
      gateway.disconnect();
    }finally{globalThis.WebSocket=prevWs;globalThis.window=prevWindow;}
  });
});

describe('bounded movement delivery',()=>{
  const active:RealtimeGateway[]=[];
  beforeEach(()=>{
    vi.useFakeTimers();vi.stubGlobal('WebSocket',MockWebSocket);vi.stubGlobal('window',{location:{protocol:'http:',host:'localhost:3000'}});MockWebSocket.reset();
  });
  afterEach(()=>{for(const gateway of active.splice(0))gateway.disconnect();vi.unstubAllGlobals();vi.useRealTimers();});
  function fixture(welcome=true){
    const onError=vi.fn(),onBootstrap=vi.fn(),onSnapshot=vi.fn();
    const gateway=new RealtimeGateway({onError,onBootstrap,onSnapshot});active.push(gateway);gateway.connect('save-1','adena_fields');
    const socket=MockWebSocket.instances.at(-1)!;socket.readyState=MockWebSocket.OPEN;
    if(welcome)socket.emit('message',{data:JSON.stringify({type:'welcome',payload:{protocolVersion:MOVEMENT_PROTOCOL,self:{locationId:'adena_fields',x:100,y:100}}})});
    return {gateway,socket,onError,onBootstrap,onSnapshot};
  }
  const snapshot=(ack:number)=>({locationId:'adena_fields',x:100,y:100,ack,serverTime:1,moving:false});
  it('validates local command values and serializes only the movement contract',()=>{
    const f=fixture();expect(f.gateway.sendMovement({dx:NaN,dy:0},{x:100,y:100})).toBe(false);
    expect(f.gateway.sendMovement({dx:2,dy:0},{x:100,y:100})).toBe(false);expect(f.gateway.movementCapacity()).toBe(8);
    const command={dx:1,dy:0,prediction:{x:999,y:999},saveId:'wrong'};
    expect(f.gateway.sendMovement(command,{x:110,y:100})).toBe(true);
    expect(JSON.parse(f.socket.sent.at(-1)!)).toEqual({type:'move_command',seq:1,locationId:'adena_fields',dx:1,dy:0});
  });
  it('limits unacknowledged steps and immediately restores capacity after acknowledgement',()=>{
    const f=fixture();expect(f.gateway.movementCapacity()).toBe(8);
    for(let i=0;i<8;i++)expect(f.gateway.sendMovement({dx:1,dy:0},{x:110+i*10,y:100})).toBe(true);
    expect(f.gateway.sendMovement({dx:1,dy:0},{x:999,y:100})).toBe(false);expect(f.gateway.movementState()).toBe('waiting');
    f.gateway.reconcile(snapshot(3),{x:180,y:100});expect(f.gateway.movementCapacity()).toBe(3);
    expect(f.socket.sent.filter(raw=>JSON.parse(raw).type==='move_command')).toHaveLength(8);
  });
  it('does not let repeated old acknowledgements postpone reconnect forever',()=>{
    const f=fixture();f.gateway.sendMovement({dx:1,dy:0},{x:110,y:100});
    vi.advanceTimersByTime(2000);f.gateway.reconcile(snapshot(0),{x:110,y:100});vi.advanceTimersByTime(1001);
    expect(f.socket.readyState).toBe(MockWebSocket.CLOSED);expect(f.gateway.movementCapacity()).toBe(0);expect(f.onError).toHaveBeenCalledTimes(1);
  });
  it('ignores messages from a closed socket after automatic reconnect in the same epoch',()=>{
    const f=fixture();f.socket.emit('close');vi.advanceTimersByTime(800);
    const next=MockWebSocket.instances.at(-1)!;next.readyState=MockWebSocket.OPEN;
    f.socket.emit('message',{data:JSON.stringify({type:'welcome',payload:{protocolVersion:MOVEMENT_PROTOCOL,self:{locationId:'adena_fields',x:999,y:999}}})});
    f.socket.emit('message',{data:JSON.stringify({type:'motion_snapshot',payload:snapshot(0)})});
    expect(f.onBootstrap).toHaveBeenCalledTimes(1);expect(f.onSnapshot).not.toHaveBeenCalled();expect(f.gateway.movementCapacity()).toBe(0);
    next.emit('message',{data:JSON.stringify({type:'welcome',payload:{protocolVersion:MOVEMENT_PROTOCOL,self:{locationId:'adena_fields',x:200,y:200}}})});
    expect(f.gateway.movementCapacity()).toBe(8);expect(f.onBootstrap).toHaveBeenCalledTimes(2);
  });
  it('times out an open connection that never sends a compatible welcome',()=>{
    const f=fixture(false);expect(f.gateway.movementCapacity()).toBe(0);vi.advanceTimersByTime(10001);
    expect(f.socket.readyState).toBe(MockWebSocket.CLOSED);expect(f.onError).toHaveBeenCalledTimes(1);
  });
  it('bounds outgoing socket buffering and recovers when it drains',()=>{
    const f=fixture();f.socket.bufferedAmount=65536;expect(f.gateway.movementCapacity()).toBe(0);
    f.socket.bufferedAmount=0;expect(f.gateway.movementCapacity()).toBe(8);vi.advanceTimersByTime(3001);
    expect(f.socket.readyState).toBe(MockWebSocket.OPEN);
    f.socket.bufferedAmount=65536;expect(f.gateway.movementCapacity()).toBe(0);vi.advanceTimersByTime(3001);
    expect(f.socket.readyState).toBe(MockWebSocket.CLOSED);
  });
  it.each([-1,NaN,1.5,20])('rejects an invalid or unissued acknowledgement %s',ack=>{
    const f=fixture();f.gateway.sendMovement({dx:1,dy:0},{x:110,y:100});
    expect(f.gateway.reconcile(snapshot(ack),{x:110,y:100})).toBeNull();expect(f.gateway.movementCapacity()).toBe(7);
  });
  it('cancels a queued reconnect during travel, so an old scene cannot replace the new session',()=>{
    const f=fixture();f.socket.emit('close');f.gateway.freezePlayerInput();vi.advanceTimersByTime(20000);
    expect(MockWebSocket.instances).toHaveLength(1);expect(f.onError).not.toHaveBeenCalled();
  });
  it.each([0,150,350,700])('keeps fixed-step prediction bounded with acknowledgements delayed by %i ms',delay=>{
    const f=fixture(),world=new CollisionWorld({width:40,height:10,tilewidth:64,tileheight:64,layers:[{name:'ground',data:Array(400).fill(1)}]});
    const motion=new PlayerMotion({x:100,y:100}),pending:Array<{at:number;ack:number;x:number;y:number}>=[];
    let server={x:100,y:100},sent=0;
    vi.spyOn(f.socket,'send').mockImplementation(raw=>{
      const input=JSON.parse(raw);if(input.type!=='move_command')return;
      server=world.move(server,input.dx,input.dy,300,.05);sent++;
      pending.push({at:Date.now()+delay,ack:input.seq,...server});
    });
    for(let tick=0;tick<80;tick++) {
      vi.advanceTimersByTime(50);
      while(pending[0]&&pending[0].at<=Date.now()) {
        const ack=pending.shift()!,before=motion.position();
        const correction=f.gateway.reconcile({...snapshot(ack.ack),x:ack.x,y:ack.y},before)!;
        motion.correct(correction);f.gateway.applyPredictionCorrection(correction.x-before.x,correction.y-before.y);
      }
      for(const frame of motion.advance(world,50,1,0,300,null,f.gateway.movementCapacity()))expect(f.gateway.sendMovement({dx:frame.dx,dy:frame.dy},frame.prediction)).toBe(true);
      expect(pending.length).toBeLessThanOrEqual(8);expect(motion.x).toBeCloseTo(server.x);
    }
    if(delay>350)expect(sent).toBeLessThan(80);else expect(sent).toBe(80);
    expect(f.onError).not.toHaveBeenCalled();
  });
  it('releases all movement timers during travel handoff',()=>{
    const f=fixture();f.gateway.sendMovement({dx:1,dy:0},{x:110,y:100});f.gateway.freezePlayerInput();vi.advanceTimersByTime(20000);
    expect(f.onError).not.toHaveBeenCalled();expect(f.gateway.movementState()).toBe('travel');
  });
});
