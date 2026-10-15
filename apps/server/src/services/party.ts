import { randomBytes } from 'node:crypto';
import {
  PARTY_INVITE_TTL_MS,
  PARTY_MAX_SIZE,
  PARTY_XP_RANGE,
  type PartyInvitePayload,
  type PartyMemberInfo,
  type PartySnapshot,
  type PlayerSave,
  type PvpStatus,
} from '@empery/shared';
import { getLocation } from './locations.js';

export { PARTY_MAX_SIZE, PARTY_INVITE_TTL_MS, PARTY_XP_RANGE };

export interface PartyRecord {
  id: string;
  leaderSaveId: string;
  memberSaveIds: string[];
  createdAt: number;
  assistTargetSaveId: string | null;
  assistTargetName: string | null;
}

interface PendingInvite {
  partyId: string;
  fromSaveId: string;
  fromName: string;
  toSaveId: string;
  expiresAt: number;
}

export interface PartyPresenceLookup {
  presenceForSave(saveId: string): {
    saveId: string;
    name: string;
    level: number;
    race: string;
    profession: string;
    locationId: string;
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    mp?: number;
    maxMp?: number;
    pvpStatus?: PvpStatus;
    connectionStatus?: 'online' | 'disconnected';
  } | null;
  loadSave(saveId: string): PlayerSave | null;
  isCombatActive?(saveId: string): boolean;
}

function newId(): string {
  return randomBytes(8).toString('hex');
}

function locationLabel(locationId: string | null | undefined): string | null {
  if (!locationId) return null;
  return getLocation(locationId)?.name ?? locationId;
}

export class PartyService {
  private parties = new Map<string, PartyRecord>();
  private bySave = new Map<string, string>();
  private invites = new Map<string, PendingInvite>(); // key = toSaveId

  getPartyId(saveId: string): string | null {
    return this.bySave.get(saveId) ?? null;
  }

  getParty(partyId: string): PartyRecord | null {
    return this.parties.get(partyId) ?? null;
  }

  getPartyForSave(saveId: string): PartyRecord | null {
    const id = this.bySave.get(saveId);
    return id ? this.parties.get(id) ?? null : null;
  }

  private pruneInvites(): void {
    const now = Date.now();
    for (const [to, inv] of this.invites) {
      if (now > inv.expiresAt) this.invites.delete(to);
    }
  }

  invite(
    from: PlayerSave,
    to: PlayerSave,
  ): { invite: PartyInvitePayload } | { error: string; code: string } {
    this.pruneInvites();
    if (from.id === to.id) {
      return { error: 'Нельзя пригласить себя', code: 'PARTY_SELF' };
    }
    if (this.bySave.has(to.id)) {
      return { error: `${to.name} уже в пати`, code: 'PARTY_TARGET_BUSY' };
    }
    const existingInvite = this.invites.get(to.id);
    if (existingInvite && existingInvite.fromSaveId === from.id && Date.now() <= existingInvite.expiresAt) {
      return { error: 'Приглашение уже отправлено', code: 'PARTY_INVITE_PENDING' };
    }

    let party = this.getPartyForSave(from.id);
    if (!party) {
      party = {
        id: newId(),
        leaderSaveId: from.id,
        memberSaveIds: [from.id],
        createdAt: Date.now(),
        assistTargetSaveId: null,
        assistTargetName: null,
      };
      this.parties.set(party.id, party);
      this.bySave.set(from.id, party.id);
    } else if (party.leaderSaveId !== from.id) {
      return { error: 'Приглашать может только лидер', code: 'PARTY_NOT_LEADER' };
    }
    if (party.memberSaveIds.length >= PARTY_MAX_SIZE) {
      return { error: `Пати полная (${PARTY_MAX_SIZE})`, code: 'PARTY_FULL' };
    }

    const expiresAt = Date.now() + PARTY_INVITE_TTL_MS;
    this.invites.set(to.id, {
      partyId: party.id,
      fromSaveId: from.id,
      fromName: from.name,
      toSaveId: to.id,
      expiresAt,
    });

    return {
      invite: {
        partyId: party.id,
        fromSaveId: from.id,
        fromName: from.name,
        expiresAt,
      },
    };
  }

  accept(
    to: PlayerSave,
    partyId: string,
  ): { party: PartyRecord } | { error: string; code: string } {
    this.pruneInvites();
    const inv = this.invites.get(to.id);
    if (!inv || inv.partyId !== partyId) {
      return { error: 'Приглашение не найдено', code: 'PARTY_INVITE_GONE' };
    }
    if (Date.now() > inv.expiresAt) {
      this.invites.delete(to.id);
      return { error: 'Приглашение истекло', code: 'PARTY_INVITE_EXPIRED' };
    }
    if (this.bySave.has(to.id)) {
      this.invites.delete(to.id);
      return { error: 'Ты уже в пати', code: 'PARTY_ALREADY' };
    }
    const party = this.parties.get(partyId);
    if (!party) {
      this.invites.delete(to.id);
      return { error: 'Пати распущена', code: 'PARTY_GONE' };
    }
    if (party.memberSaveIds.length >= PARTY_MAX_SIZE) {
      this.invites.delete(to.id);
      return { error: 'Пати полная', code: 'PARTY_FULL' };
    }

    party.memberSaveIds.push(to.id);
    this.bySave.set(to.id, party.id);
    this.invites.delete(to.id);
    return { party };
  }

  decline(toSaveId: string, partyId: string): void {
    const inv = this.invites.get(toSaveId);
    if (inv && inv.partyId === partyId) this.invites.delete(toSaveId);
  }

  leave(saveId: string):
    | { party: PartyRecord | null; disbanded: boolean; leftoverSaveIds: string[] }
    | { error: string; code: string } {
    const party = this.getPartyForSave(saveId);
    if (!party) return { error: 'Ты не в пати', code: 'PARTY_NONE' };

    party.memberSaveIds = party.memberSaveIds.filter((id) => id !== saveId);
    this.bySave.delete(saveId);

    if (party.assistTargetSaveId === saveId) {
      party.assistTargetSaveId = null;
      party.assistTargetName = null;
    }

    if (party.memberSaveIds.length <= 1) {
      const leftover = [...party.memberSaveIds];
      for (const id of leftover) this.bySave.delete(id);
      this.parties.delete(party.id);
      this.clearInvitesForParty(party.id);
      return { party: null, disbanded: true, leftoverSaveIds: leftover };
    }

    if (party.leaderSaveId === saveId) {
      party.leaderSaveId = party.memberSaveIds[0]!;
    }
    return { party, disbanded: false, leftoverSaveIds: [] };
  }

  kick(
    leaderSaveId: string,
    targetSaveId: string,
  ): { party: PartyRecord | null; kickedSaveId: string } | { error: string; code: string } {
    const party = this.getPartyForSave(leaderSaveId);
    if (!party) return { error: 'Ты не в пати', code: 'PARTY_NONE' };
    if (party.leaderSaveId !== leaderSaveId) {
      return { error: 'Кикать может только лидер', code: 'PARTY_NOT_LEADER' };
    }
    if (targetSaveId === leaderSaveId) {
      return { error: 'Нельзя кикнуть себя', code: 'PARTY_SELF' };
    }
    if (!party.memberSaveIds.includes(targetSaveId)) {
      return { error: 'Игрок не в пати', code: 'PARTY_NOT_MEMBER' };
    }
    party.memberSaveIds = party.memberSaveIds.filter((id) => id !== targetSaveId);
    this.bySave.delete(targetSaveId);
    if (party.assistTargetSaveId === targetSaveId) {
      party.assistTargetSaveId = null;
      party.assistTargetName = null;
    }
    if (party.memberSaveIds.length <= 1) {
      for (const id of party.memberSaveIds) this.bySave.delete(id);
      this.parties.delete(party.id);
      this.clearInvitesForParty(party.id);
      return { party: null, kickedSaveId: targetSaveId };
    }
    return { party, kickedSaveId: targetSaveId };
  }

  disband(leaderSaveId: string): { members: string[] } | { error: string; code: string } {
    const party = this.getPartyForSave(leaderSaveId);
    if (!party) return { error: 'Ты не в пати', code: 'PARTY_NONE' };
    if (party.leaderSaveId !== leaderSaveId) {
      return { error: 'Распустить может только лидер', code: 'PARTY_NOT_LEADER' };
    }
    const members = [...party.memberSaveIds];
    for (const id of members) this.bySave.delete(id);
    this.parties.delete(party.id);
    this.clearInvitesForParty(party.id);
    return { members };
  }

  promote(
    leaderSaveId: string,
    targetSaveId: string,
  ): { party: PartyRecord } | { error: string; code: string } {
    const party = this.getPartyForSave(leaderSaveId);
    if (!party) return { error: 'Ты не в пати', code: 'PARTY_NONE' };
    if (party.leaderSaveId !== leaderSaveId) {
      return { error: 'Передать лидера может только лидер', code: 'PARTY_NOT_LEADER' };
    }
    if (targetSaveId === leaderSaveId) {
      return { error: 'Ты уже лидер', code: 'PARTY_SELF' };
    }
    if (!party.memberSaveIds.includes(targetSaveId)) {
      return { error: 'Игрок не в пати', code: 'PARTY_NOT_MEMBER' };
    }
    party.leaderSaveId = targetSaveId;
    return { party };
  }

  setAssistTarget(
    leaderSaveId: string,
    targetSaveId: string | null,
    targetName: string | null,
  ): { party: PartyRecord } | { error: string; code: string } {
    const party = this.getPartyForSave(leaderSaveId);
    if (!party) return { error: 'Ты не в пати', code: 'PARTY_NONE' };
    if (party.leaderSaveId !== leaderSaveId) {
      return { error: 'Цель пати задаёт только лидер', code: 'PARTY_NOT_LEADER' };
    }
    if (targetSaveId === leaderSaveId) {
      return { error: 'Нельзя назначить себя целью пати', code: 'PARTY_SELF' };
    }
    party.assistTargetSaveId = targetSaveId;
    party.assistTargetName = targetSaveId ? targetName : null;
    return { party };
  }

  private clearInvitesForParty(partyId: string): void {
    for (const [to, inv] of this.invites) {
      if (inv.partyId === partyId) this.invites.delete(to);
    }
  }

  buildSnapshot(party: PartyRecord, lookup: PartyPresenceLookup): PartySnapshot {
    const members: PartyMemberInfo[] = party.memberSaveIds.map((saveId) => {
      const presence = lookup.presenceForSave(saveId);
      const save = lookup.loadSave(saveId);
      const locationId = presence?.locationId ?? save?.location ?? null;
      return {
        saveId,
        name: presence?.name ?? save?.name ?? '?',
        level: presence?.level ?? save?.level ?? 1,
        race: presence?.race ?? save?.race ?? 'human',
        profession: presence?.profession ?? save?.profession ?? 'warrior',
        locationId,
        locationName: locationLabel(locationId),
        online: Boolean(presence) && presence?.connectionStatus !== 'disconnected',
        hp: presence?.hp ?? save?.hp ?? null,
        maxHp: presence?.maxHp ?? save?.maxHp ?? null,
        mp: presence?.mp ?? save?.mp ?? null,
        maxMp: presence?.maxMp ?? save?.maxMp ?? null,
        pvpStatus: presence?.pvpStatus ?? 'peaceful',
        inCombat: lookup.isCombatActive?.(saveId) ?? false,
      };
    });
    return {
      id: party.id,
      leaderSaveId: party.leaderSaveId,
      members,
      assistTargetSaveId: party.assistTargetSaveId,
      assistTargetName: party.assistTargetName,
    };
  }

  /**
   * Party members eligible for shared kill XP: online, same location, within range.
   * Always includes the killer when they are in a party of 2+.
   */
  eligibleForKillXp(
    killerSaveId: string,
    lookup: PartyPresenceLookup,
  ): { saveIds: string[]; shareCount: number } {
    const party = this.getPartyForSave(killerSaveId);
    if (!party || party.memberSaveIds.length < 2) {
      return { saveIds: [killerSaveId], shareCount: 1 };
    }
    const killer = lookup.presenceForSave(killerSaveId);
    if (!killer) {
      return { saveIds: [killerSaveId], shareCount: 1 };
    }

    const eligible: string[] = [];
    for (const id of party.memberSaveIds) {
      const p = lookup.presenceForSave(id);
      if (!p) continue;
      if (p.locationId !== killer.locationId) continue;
      const dx = p.x - killer.x;
      const dy = p.y - killer.y;
      if (Math.hypot(dx, dy) > PARTY_XP_RANGE) continue;
      eligible.push(id);
    }
    if (!eligible.includes(killerSaveId)) eligible.unshift(killerSaveId);
    if (eligible.length < 2) {
      return { saveIds: [killerSaveId], shareCount: 1 };
    }
    return { saveIds: eligible, shareCount: eligible.length };
  }
}
