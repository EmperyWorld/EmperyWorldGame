import { MOVEMENT_PROTOCOL, MAX_INPUT_BACKLOG } from '@empery/shared/movement';
import type { MovementSnapshot } from '@empery/shared/movement';
import type {
  MultiplayerBootstrap,
  MultiplayerClientMessage,
  MultiplayerServerMessage,
} from '../../api.js';

export interface RealtimeGatewayOptions {
  onBootstrap?: (bootstrap: MultiplayerBootstrap) => void;
  onSnapshot?: (message: MultiplayerServerMessage) => void;
  onError?: (error: string) => void;
  onReconnect?: () => void;
}

const ACK_TIMEOUT_MS = 3000;
const HANDSHAKE_TIMEOUT_MS = 10_000;
const MAX_BUFFERED_BYTES = 64 * 1024;
export type MovementConnectionState = 'ready' | 'waiting' | 'connecting' | 'travel' | 'unavailable';

const RECONNECT_BASE_MS = 800;
const RECONNECT_MAX_MS = 12_000;

/**
 * Multiplayer transport: presence + enemy_snapshot replication.
 * Combat damage still goes over HTTP; world pose is server-authored.
 */
export class RealtimeGateway {
  private rxBytes=0;private txBytes=0;private correctionCount=0;private correctionPx=0;private rtt=0;private nextPing=0;
  performanceSnapshot(){
    const result={rttMs:this.rtt,corrections:this.correctionCount,correctionPx:this.correctionPx,rxBytes:this.rxBytes,txBytes:this.txBytes};
    this.rxBytes=0;this.txBytes=0;this.correctionCount=0;this.correctionPx=0;
    const now=Date.now();if(now>=this.nextPing){this.nextPing=now+2000;this.send({type:'ping',ts:now});}
    return result;
  }
  private sequence=0;
  private movementReady=false;
  private handshakeTimer: ReturnType<typeof setTimeout> | null = null;
  private backpressureTimer: ReturnType<typeof setTimeout> | null = null;
  private acknowledgementTimer: ReturnType<typeof setTimeout> | null = null;
  private acknowledged=0;
  private predictions=new Map<number,{x:number;y:number}>();
  movementCapacity(): number {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || this.playerInputFrozen || !this.movementReady) return 0;
    if ((this.socket.bufferedAmount ?? 0) >= MAX_BUFFERED_BYTES) {
      if (this.backpressureTimer === null) {
        const socket = this.socket;
        this.backpressureTimer = setTimeout(() => {
          this.backpressureTimer = null;
          if (this.socket !== socket || !this.movementReady || (socket.bufferedAmount ?? 0) < MAX_BUFFERED_BYTES) return;
          this.movementReady = false;
          this.options.onError?.('Отправка команд задерживается — переподключение');
          socket.close();
        }, ACK_TIMEOUT_MS);
      }
      return 0;
    }
    if (this.backpressureTimer !== null) { clearTimeout(this.backpressureTimer); this.backpressureTimer = null; }
    return Math.max(0, MAX_INPUT_BACKLOG - (this.sequence - this.acknowledged));
  }
  movementState(): MovementConnectionState {
    if (this.playerInputFrozen) return 'travel';
    if (!this.reconnectAllowed || this.intentionalClose) return 'unavailable';
    if (!this.movementReady || this.socket?.readyState !== WebSocket.OPEN) return 'connecting';
    return this.movementCapacity() ? 'ready' : 'waiting';
  }
  sendMovement(input:{dx:number;dy:number;dash?:boolean;persist?:boolean},prediction:{x:number;y:number}):boolean {
    if (![input.dx,input.dy,prediction.x,prediction.y].every(Number.isFinite) || Math.abs(input.dx)>1 || Math.abs(input.dy)>1 || !this.movementCapacity()) return false;
    const wasIdle = this.sequence === this.acknowledged;
    const seq=++this.sequence;
    this.predictions.set(seq,{...prediction});
    this.send({type:'move_command',seq,locationId:this.locationId,dx:input.dx,dy:input.dy,dash:typeof input.dash==='boolean'?input.dash:undefined,persist:typeof input.persist==='boolean'?input.persist:undefined});
    if (wasIdle) this.armAcknowledgementTimeout();
    return true;
  }
  private clearTransportTimers(): void {
    if (this.handshakeTimer !== null) clearTimeout(this.handshakeTimer);
    if (this.acknowledgementTimer !== null) clearTimeout(this.acknowledgementTimer);
    if (this.backpressureTimer !== null) clearTimeout(this.backpressureTimer);
    this.backpressureTimer = null; this.handshakeTimer = null; this.acknowledgementTimer = null;
  }
  private armAcknowledgementTimeout(): void {
    if (this.acknowledgementTimer !== null) clearTimeout(this.acknowledgementTimer);
    this.acknowledgementTimer = null;
    if (this.sequence === this.acknowledged || this.playerInputFrozen) return;
    const socket = this.socket;
    this.acknowledgementTimer = setTimeout(() => {
      this.acknowledgementTimer = null;
      if (!socket || this.socket !== socket || !this.movementReady) return;
      this.movementReady = false;
      this.options.onError?.('Сервер не подтверждает движение — переподключение');
      socket.close();
    }, ACK_TIMEOUT_MS);
  }
  reconcile(snapshot:MovementSnapshot,current:{x:number;y:number}):{x:number;y:number}|null {
    if(!this.movementReady || snapshot.locationId!==this.locationId || !Number.isSafeInteger(snapshot.ack) || snapshot.ack<this.acknowledged || snapshot.ack>this.sequence || !Number.isFinite(snapshot.x) || !Number.isFinite(snapshot.y))return null;
    const advanced = snapshot.ack > this.acknowledged;
    this.acknowledged=snapshot.ack;
    if (advanced) this.armAcknowledgementTimeout();
    const predicted=this.predictions.get(snapshot.ack);
    for(const seq of this.predictions.keys())if(seq<snapshot.ack)this.predictions.delete(seq);
    if(!predicted)return {x:snapshot.x,y:snapshot.y};
    return {x:current.x+snapshot.x-predicted.x,y:current.y+snapshot.y-predicted.y};
  }
  applyPredictionCorrection(dx:number,dy:number):void {
    const distance=Math.hypot(dx,dy);if(distance>.5){this.correctionCount++;this.correctionPx+=distance;}
    for(const point of this.predictions.values()){point.x+=dx;point.y+=dy;}
  }
  private socket: WebSocket | null = null;
  private saveId = '';
  private locationId = '';
  private intentionalClose = false;
  private reconnectAllowed = true;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectionEpoch = 0;
  /** After HTTP travel, old scene must not stream apartment coords onto the new map. */
  private playerInputFrozen = false;

  constructor(private readonly options: RealtimeGatewayOptions = {}) {}

  connect(saveId: string, locationId?: string): void {
    this.disconnect();
    this.saveId = saveId;
    if (locationId) this.locationId = locationId;
    this.intentionalClose = false;
    this.reconnectAllowed = true;
    this.reconnectAttempt = 0;
    this.playerInputFrozen = false;
    this.connectionEpoch += 1;
    this.openSocket(this.connectionEpoch);
  }

  setLocation(locationId: string): void {
    this.locationId = locationId;
  }

  /** Freeze pose sync until the next scene connect (travel handoff). */
  freezePlayerInput(): void {
    this.playerInputFrozen = true;
    this.clearTransportTimers();
    this.clearReconnectTimer();
  }

  isPlayerInputFrozen(): boolean {
    return this.playerInputFrozen;
  }

  send(message: MultiplayerClientMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    if (this.playerInputFrozen && (message.type === 'player_input'||message.type==='move_command')) return;
    const raw=JSON.stringify(message);this.txBytes+=new TextEncoder().encode(raw).length;
    this.socket.send(raw);
  }

  disconnect(): void {
    this.clearTransportTimers();
    this.predictions.clear();
    this.movementReady=false;
    this.intentionalClose = true;
    this.connectionEpoch += 1;
    this.clearReconnectTimer();
    this.socket?.close();
    this.socket = null;
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleReconnect(epoch: number): void {
    if (this.intentionalClose || !this.reconnectAllowed || !this.saveId || this.playerInputFrozen) return;
    this.clearReconnectTimer();
    const delay = Math.min(
      RECONNECT_BASE_MS * 2 ** this.reconnectAttempt,
      RECONNECT_MAX_MS,
    );
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (epoch !== this.connectionEpoch) return;
      if (this.intentionalClose || !this.reconnectAllowed || !this.saveId || this.playerInputFrozen) return;
      this.openSocket(epoch);
    }, delay);
  }

  private shouldStopReconnect(code: string | undefined): boolean {
    return (
      code === 'SESSION_REPLACED' ||
      code === 'AUTH_REQUIRED' ||
      code === 'FORBIDDEN_SAVE' ||
      code === 'SAVE_NOT_FOUND' ||
      code === 'BAD_SAVE_ID'
    );
  }

  private openSocket(epoch: number): void {
    if (epoch !== this.connectionEpoch) return;
    if (this.socket && (this.socket.readyState === WebSocket.CONNECTING || this.socket.readyState === WebSocket.OPEN)) {
      return;
    }

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const token = (() => {
      try {
        return localStorage.getItem('empery_auth_token');
      } catch {
        return null;
      }
    })();
    const qs = new URLSearchParams({ saveId: this.saveId });
    if (token) qs.set('token', token);
    const url = `${proto}//${window.location.host}/ws?${qs.toString()}`;
    const socket = new WebSocket(url);
    this.socket = socket;
    this.handshakeTimer = setTimeout(() => {
      this.handshakeTimer = null;
      if (this.socket !== socket || epoch !== this.connectionEpoch || this.movementReady) return;
      this.options.onError?.('Сервер не завершил подключение — повторная попытка');
      socket.close();
    }, HANDSHAKE_TIMEOUT_MS);

    socket.addEventListener('message', (event) => {
      if (epoch !== this.connectionEpoch || this.socket !== socket) return;
      try {
        this.rxBytes+=new TextEncoder().encode(String(event.data)).length;
        const message = JSON.parse(String(event.data)) as MultiplayerServerMessage;
        if(message.type==='pong'){this.rtt=Math.max(0,Date.now()-message.ts);return;}
        if (message.type === 'welcome') {
          if(message.payload.protocolVersion!==MOVEMENT_PROTOCOL){this.clearTransportTimers();this.reconnectAllowed=false;this.intentionalClose=true;this.options.onError?.('Обновите страницу: версии клиента и сервера несовместимы');socket.close();return;}
          if (message.payload.self.locationId !== this.locationId || !Number.isFinite(message.payload.self.x) || !Number.isFinite(message.payload.self.y)) return;
          this.clearTransportTimers();
          this.sequence=0;this.acknowledged=0;this.predictions.clear();
          this.movementReady=true;
          if(Number.isFinite(message.payload.self.x)&&Number.isFinite(message.payload.self.y))this.predictions.set(0,{x:message.payload.self.x,y:message.payload.self.y});
          const reconnected = this.reconnectAttempt > 0;
          this.reconnectAttempt = 0;
          if (this.locationId) {
            this.send({ type: 'join_location', locationId: this.locationId });
          }
          this.options.onBootstrap?.(message.payload);
          if (reconnected) this.options.onReconnect?.();
          return;
        }
        if (message.type === 'error') {
          if (this.shouldStopReconnect(message.code)) {
            this.reconnectAllowed = false;
            this.intentionalClose = true;
            this.clearReconnectTimer();
            this.clearTransportTimers();
            this.movementReady = false;
            socket.close();
          }
          this.options.onError?.(message.error);
          return;
        }
        this.options.onSnapshot?.(message);
      } catch (err) {
        this.options.onError?.(err instanceof Error ? err.message : 'Bad realtime payload');
      }
    });

    socket.addEventListener('close', () => {
      if (epoch !== this.connectionEpoch) return;
      if (this.socket !== socket) return;
      this.clearTransportTimers();
      this.predictions.clear();
      this.socket = null;
      this.movementReady=false;
      if (this.intentionalClose) return;
      this.scheduleReconnect(epoch);
    });
  }
}
