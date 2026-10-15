import Phaser from 'phaser';
import type { PlayerSave, PlayerStats, SkillDefinition } from '../../api.js';
import type { WorldNavigationTarget } from '@empery/shared';
import { InputManager } from '../systems/InputManager.js';
import { NetworkManager } from '../systems/NetworkManager.js';
import { RealtimeGateway } from '../systems/RealtimeGateway.js';
import { EntityManager } from '../systems/EntityManager.js';
import { RemotePlayerManager } from '../systems/RemotePlayerManager.js';
import { VfxSystem } from '../systems/VfxSystem.js';
import { MinimapSystem } from '../systems/MinimapSystem.js';
import { QuestPresenter } from '../systems/QuestPresenter.js';
import { PortalSystem } from '../systems/PortalSystem.js';
import { PvpPresenter } from '../systems/PvpPresenter.js';
import { GameplaySession } from '../systems/GameplaySession.js';
import type { LocationConfig } from './location-types.js';

export interface GameSceneData {
  save: PlayerSave;
  stats: PlayerStats;
  location: LocationConfig;
}

/** Thin Phaser scene shell — orchestration lives in GameplaySession. */
export class GameScene extends Phaser.Scene {
  readonly inputManager = new InputManager();
  readonly network = new NetworkManager();
  readonly pvp = new PvpPresenter();
  readonly portals = new PortalSystem();
  readonly realtime = new RealtimeGateway({
    onBootstrap: (bootstrap) => this.session.handleBootstrap(bootstrap),
    onSnapshot: (message) => this.session.handleRealtimeMessage(message),
    onError: (error) => this.session.handleRealtimeError(error),
    onReconnect: () => this.session.handleRealtimeReconnect(),
  });
  readonly entities = new EntityManager();
  readonly remotePlayers = new RemotePlayerManager();
  readonly vfx = new VfxSystem();
  readonly minimap = new MinimapSystem();
  readonly quests = new QuestPresenter();

  private readonly session = new GameplaySession();

  constructor() {
    super('GameScene');
  }

  get inputManagerPublic(): InputManager {
    return this.inputManager;
  }

  init(data: GameSceneData): void {
    this.session.begin(data);
  }

  create(): void {
    this.session.boot(this, {
      inputManager: this.inputManager,
      network: this.network,
      realtime: this.realtime,
      entities: this.entities,
      remotePlayers: this.remotePlayers,
      vfx: this.vfx,
      minimap: this.minimap,
      quests: this.quests,
      portals: this.portals,
      pvp: this.pvp,
    });
  }

  update(): void {
    this.session.update();
  }

  setActiveSkillIds(ids: (string | null)[]): void {
    this.registry.set('activeSkillIds', ids);
    this.session.setActiveSkillIds(ids);
  }

  setSkillDefinitions(skills: SkillDefinition[]): void {
    this.registry.set('skillDefinitions', skills);
    this.session.setSkillDefinitions(skills);
  }

  clearAllyHudBuffs(): void {
    this.session.clearAllyHudBuffs();
  }

  toggleAutoAttack(): boolean {
    return this.session.toggleAutoAttack();
  }

  isAutoAttackActive(): boolean {
    return this.session.isAutoAttackActive();
  }

  getAutoAttackRemainingMs(): number {
    return this.session.getAutoAttackRemainingMs();
  }

  respawnPlayer(save: PlayerSave, stats: PlayerStats): void {
    this.session.respawnPlayer(save, stats);
  }

  notifyTravelResult(ok: boolean): void {
    this.session.notifyTravelResult(ok);
  }

  tryConfirmTravel(): boolean {
    return this.portals.tryConfirm();
  }

  setNavigationTarget(target: WorldNavigationTarget): boolean {
    return this.minimap.setNavigationTarget(target);
  }

  nearestDeadPlayer(range: number): { saveId: string; name: string; dist: number } | null {
    return this.session.nearestDeadPlayer(range);
  }

  updateSave(save: PlayerSave, stats: PlayerStats, opts?: { combatTick?: boolean }): void {
    this.session.updateSave(save, stats, opts);
  }

  applyGroundLootSnapshot(piles: import('@empery/shared').GroundLootPile[] | undefined): void {
    this.session.applyGroundLootSnapshot(piles);
  }

  applyGroundLootSpawned(pile: import('@empery/shared').GroundLootPile): void {
    this.session.applyGroundLootSpawned(pile);
  }

  applyGroundLootRemoved(payload: import('@empery/shared').GroundLootRemovedPayload): void {
    this.session.applyGroundLootRemoved(payload);
  }

  applyCompanionFetchStarted(payload: import('@empery/shared').CompanionFetchStartedPayload): void {
    this.session.applyCompanionFetchStarted(payload);
  }

  transitionTo(save: PlayerSave, stats: PlayerStats, location: LocationConfig): void {
    this.network.abort();
    this.registry.set('bootSave', save);
    this.registry.set('bootStats', stats);
    this.registry.set('bootLocation', location);
    this.scene.stop('GameScene');
    this.scene.stop('BootScene');
    this.scene.start('BootScene');
  }

  getLocationId(): string {
    return this.session.getLocationId();
  }

  sendChat(channel: 'location' | 'global' | 'private' | 'party', text: string, toName?: string): void {
    this.session.sendChat(channel, text, toName);
  }

  sendPartyInvite(toName: string): void {
    this.session.sendPartyInvite(toName);
  }

  setPlayerTarget(saveId: string | null, nameHint?: string): void {
    this.session.setPlayerTarget(saveId, nameHint);
  }

  clearPlayerTarget(): void {
    this.session.clearPlayerTarget();
  }

  getPlayerTargetSaveId(): string | null {
    return this.session.getPlayerTargetSaveId();
  }

  getPlayerWorldPos(): { x: number; y: number } | null {
    return this.session.getPlayerWorldPos();
  }

  sendPartyAccept(partyId: string): void {
    this.session.sendPartyAccept(partyId);
  }

  sendPartyDecline(partyId: string): void {
    this.session.sendPartyDecline(partyId);
  }

  sendPartyLeave(): void {
    this.session.sendPartyLeave();
  }

  sendPartyKick(saveId: string): void {
    this.session.sendPartyKick(saveId);
  }

  sendPartyDisband(): void {
    this.session.sendPartyDisband();
  }

  sendPartyPromote(saveId: string): void {
    this.session.sendPartyPromote(saveId);
  }

  sendPartyAssist(targetSaveId: string | null): void {
    this.session.sendPartyAssist(targetSaveId);
  }

  peekAtPlayer(saveId: string): boolean {
    return this.session.peekAtPlayer(saveId);
  }
}
