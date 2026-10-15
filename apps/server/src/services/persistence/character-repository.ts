import { isDeepStrictEqual } from 'node:util';
/** Transactional character storage. */

import type { PlayerSave } from '@empery/shared';
import type { Pool, PoolClient } from 'pg';
export interface CommandReceipt {accountId:string;key:string;fingerprint:string;result:unknown}
import type { CharacterRepository } from '../multiplayer-persistence.js';

export class PostgresCharacterRepository implements CharacterRepository {
  private owner: PoolClient | null = null;
  constructor(private readonly pool: Pool) {}

  /** One simulation owner until world partitioning/handoff is implemented. */
  async claimWorld(onLost: (error: unknown) => void): Promise<void> {
    const client = await this.pool.connect();
    const {rows} = await client.query<{owned:boolean}>("SELECT pg_try_advisory_lock(734281, 1) AS owned");
    if (!rows[0]?.owned) { client.release(); throw new Error('Another game server owns this PostgreSQL world'); }
    this.owner = client;
    client.on('error', onLost);
  }
  async releaseWorld(): Promise<void> {
    const client = this.owner; this.owner = null;
    if (!client) return;
    try { await client.query('SELECT pg_advisory_unlock(734281, 1)'); } finally { client.release(); }
  }

  async getBySaveId(saveId: string): Promise<PlayerSave | null> {
    const { rows } = await this.pool.query<{ payload_json: PlayerSave }>(
      `SELECT payload_json FROM characters WHERE save_id = $1`,
      [saveId],
    );
    const row = rows[0];
    return row?.payload_json ?? null;
  }

  async saveCharacter(save: PlayerSave): Promise<void> {
    await this.commitChanges([{id:save.id,save}]);
  }

  async listAll(): Promise<PlayerSave[]> {
    const {rows} = await this.pool.query<{payload_json:PlayerSave}>('SELECT payload_json FROM characters ORDER BY save_id');
    return rows.map(row=>row.payload_json);
  }

  async migrationApplied():Promise<boolean> {
    const {rowCount}=await this.pool.query("SELECT name FROM game_storage_migrations WHERE name='file-saves-v1'");
    return Boolean(rowCount);
  }
  async findReceipt(accountId:string,key:string):Promise<{fingerprint:string;result:unknown}|null> {
    const {rows}=await this.pool.query<{fingerprint:string;result:unknown}>('SELECT fingerprint, result FROM game_command_receipts WHERE account_id=$1 AND command_key=$2',[accountId,key]);
    return rows[0]??null;
  }
  async commitChanges(changes: Array<{id:string;save:PlayerSave|null}>, expected?:Map<string,number>, receipt?:CommandReceipt,migration=false): Promise<void> {
    if(expected&&changes.length>1)return this.commitPrimaryBatch(changes,expected,receipt);
    const client = this.owner ?? await this.pool.connect();
    const ownerConnection = client === this.owner;
    try {
      await client.query('BEGIN');
      for (const change of changes) {
      if (!change.save) {
        const result=await client.query(`DELETE FROM characters WHERE save_id = $1 AND ($2::bigint IS NULL OR COALESCE((payload_json->>'revision')::bigint,0)=$2) RETURNING save_id`,[change.id,expected?.get(change.id)??null]);
        if(expected&&result.rowCount===0&&(expected.get(change.id)??0)>0)throw new Error('Character revision conflict on delete');
        continue;
      }
      const save = change.save;
      const {rows:previousRows}=await client.query<{payload_json:PlayerSave}>('SELECT payload_json FROM characters WHERE save_id=$1 FOR UPDATE',[save.id]);
      const previous=previousRows[0]?.payload_json;
      const accepted = await client.query(
        `INSERT INTO characters (
           save_id, account_id, name, race, profession, gender, level, xp,
           location_id, world_x, world_y, karma, payload_json, updated_at
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::timestamptz
         )
         ON CONFLICT (save_id) DO UPDATE SET
           account_id = EXCLUDED.account_id,
           name = EXCLUDED.name,
           race = EXCLUDED.race,
           profession = EXCLUDED.profession,
           gender = EXCLUDED.gender,
           level = EXCLUDED.level,
           xp = EXCLUDED.xp,
           location_id = EXCLUDED.location_id,
           world_x = EXCLUDED.world_x,
           world_y = EXCLUDED.world_y,
           karma = EXCLUDED.karma,
           payload_json = EXCLUDED.payload_json,
           updated_at = EXCLUDED.updated_at
         WHERE ($15::bigint IS NULL OR COALESCE((characters.payload_json->>'revision')::bigint,0)=$15) AND CASE
           WHEN COALESCE((characters.payload_json->>'revision')::bigint, 0) = 0
             AND COALESCE((EXCLUDED.payload_json->>'revision')::bigint, 0) = 0
             THEN characters.updated_at < EXCLUDED.updated_at
           ELSE COALESCE((characters.payload_json->>'revision')::bigint, 0)
             < COALESCE((EXCLUDED.payload_json->>'revision')::bigint, 0)
           END
         RETURNING save_id`,
        [
          save.id,
          save.accountId ?? null,
          save.name,
          save.race,
          save.profession,
          save.gender === 'female' ? 'female' : 'male',
          save.level,
          save.xp,
          save.location,
          save.worldX ?? null,
          save.worldY ?? null,
          save.karma ?? 0,
          JSON.stringify(save),
          save.updatedAt,
          expected?.get(save.id)??null,
        ],
      );

      if (accepted.rowCount === 0) {
        if(expected)throw new Error('Character revision conflict');
        continue;
      }

      await this.writeChildren(client,save,previous);
      }
      if(migration)await client.query("INSERT INTO game_storage_migrations(name) VALUES('file-saves-v1')");
      if(receipt)await client.query('INSERT INTO game_command_receipts(account_id,command_key,fingerprint,result) VALUES($1,$2,$3,$4::jsonb)',[receipt.accountId,receipt.key,receipt.fingerprint,JSON.stringify(receipt.result)]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      if(!ownerConnection)client.release();
    }
  }

  private async writeChildren(client:PoolClient,save:PlayerSave,previous:PlayerSave|undefined):Promise<void> {
      const equipmentChanged=!isDeepStrictEqual([previous?.equipment,previous?.equipmentEnchants],[save.equipment,save.equipmentEnchants]);
      const skillsChanged=!isDeepStrictEqual(previous?.skillLevels,save.skillLevels);
      const inventoryChanged=!isDeepStrictEqual([previous?.inventory,previous?.inventoryEntries,previous?.inventoryEnchants],[save.inventory,save.inventoryEntries,save.inventoryEnchants]);
      if(equipmentChanged){
      await client.query(`DELETE FROM character_equipment WHERE save_id = $1`, [save.id]);
      for (const [slot, itemId] of Object.entries(save.equipment ?? {})) {
        await client.query(
          `INSERT INTO character_equipment (save_id, slot, item_id, instance)
           VALUES ($1, $2, $3, $4::jsonb)`,
          [
            save.id,
            slot,
            itemId,
            JSON.stringify({
              enchant: save.equipmentEnchants?.[slot] ?? 0,
            }),
          ],
        );
      }

      }
      if(skillsChanged){
      await client.query(`DELETE FROM character_skills WHERE save_id = $1`, [save.id]);
      for (const [skillId, level] of Object.entries(save.skillLevels ?? {})) {
        await client.query(
          `INSERT INTO character_skills (save_id, skill_id, level) VALUES ($1, $2, $3)`,
          [save.id, skillId, level],
        );
      }

      }
      if(inventoryChanged){
      await client.query(`DELETE FROM character_inventory_items WHERE save_id = $1`, [save.id]);
      const entries = save.inventoryEntries;
      if (entries?.length) {
        for (let i = 0; i < entries.length; i++) {
          const e = entries[i]!;
          await client.query(
            `INSERT INTO character_inventory_items (save_id, item_id, qty, instance, bag_index)
             VALUES ($1, $2, $3, $4::jsonb, $5)`,
            [save.id, e.itemId, e.quantity ?? 1, JSON.stringify(e), i],
          );
        }
      } else {
        for (let i = 0; i < (save.inventory ?? []).length; i++) {
          const itemId = save.inventory[i]!;
          await client.query(
            `INSERT INTO character_inventory_items (save_id, item_id, qty, instance, bag_index)
             VALUES ($1, $2, 1, $3::jsonb, $4)`,
            [
              save.id,
              itemId,
              JSON.stringify({ enchant: save.inventoryEnchants?.[i] ?? 0 }),
              i,
            ],
          );
        }
      }

      }
  }

  /** One round trip per batch of movement checkpoints; domain child rows stay transactional. */
  private async commitPrimaryBatch(changes:Array<{id:string;save:PlayerSave|null}>,expected:Map<string,number>,receipt?:CommandReceipt):Promise<void> {
    const client=this.owner??await this.pool.connect();
    const ownerConnection=client===this.owner;
    try {
      await client.query('BEGIN');
      const {rows}=await client.query<{save_id:string;payload_json:PlayerSave}>('SELECT save_id,payload_json FROM characters WHERE save_id=ANY($1::text[]) FOR UPDATE',[changes.map(change=>change.id)]);
      const previous=new Map(rows.map(row=>[row.save_id,row.payload_json]));
      for(const change of changes)if((previous.get(change.id)?.revision??0)!==(expected.get(change.id)??0))throw new Error('Character revision conflict');
      for(const change of changes)if(change.save&&(change.save.revision??0)<=(expected.get(change.id)??0))throw new Error('Character revision must advance');
      const writes=changes.filter((change):change is {id:string;save:PlayerSave}=>Boolean(change.save));
      if(writes.length){
        const result=await client.query(`WITH incoming AS (
          SELECT * FROM jsonb_to_recordset($1::jsonb) AS input(data jsonb, expected bigint)
        ) INSERT INTO characters(save_id,account_id,name,race,profession,gender,level,xp,location_id,world_x,world_y,karma,payload_json,updated_at)
          SELECT data->>'id',data->>'accountId',data->>'name',data->>'race',data->>'profession',COALESCE(data->>'gender','male'),
            (data->>'level')::integer,(data->>'xp')::bigint,data->>'location',(data->>'worldX')::double precision,(data->>'worldY')::double precision,
            COALESCE((data->>'karma')::integer,0),data,(data->>'updatedAt')::timestamptz FROM incoming
          ON CONFLICT(save_id) DO UPDATE SET account_id=EXCLUDED.account_id,name=EXCLUDED.name,race=EXCLUDED.race,profession=EXCLUDED.profession,
            gender=EXCLUDED.gender,level=EXCLUDED.level,xp=EXCLUDED.xp,location_id=EXCLUDED.location_id,world_x=EXCLUDED.world_x,world_y=EXCLUDED.world_y,
            karma=EXCLUDED.karma,payload_json=EXCLUDED.payload_json,updated_at=EXCLUDED.updated_at
          WHERE COALESCE((characters.payload_json->>'revision')::bigint,0)=(SELECT expected FROM incoming WHERE data->>'id'=EXCLUDED.save_id)
          RETURNING save_id`,[JSON.stringify(writes.map(change=>({data:change.save,expected:expected.get(change.id)??0})))]);
        if(result.rowCount!==writes.length)throw new Error('Character revision conflict');
        for(const {save} of writes)await this.writeChildren(client,save,previous.get(save.id));
      }
      const deleted=changes.filter(change=>!change.save).map(change=>change.id);
      if(deleted.length)await client.query('DELETE FROM characters WHERE save_id=ANY($1::text[])',[deleted]);
      if(receipt)await client.query('INSERT INTO game_command_receipts(account_id,command_key,fingerprint,result) VALUES($1,$2,$3,$4::jsonb)',[receipt.accountId,receipt.key,receipt.fingerprint,JSON.stringify(receipt.result)]);
      await client.query('COMMIT');
    } catch(error){await client.query('ROLLBACK');throw error;}finally{if(!ownerConnection)client.release();}
  }

  async deleteCharacter(saveId: string): Promise<void> {
    await this.pool.query(`DELETE FROM characters WHERE save_id = $1`, [saveId]);
  }

  async listSaveIdsForAccount(accountId: string): Promise<string[]> {
    const { rows } = await this.pool.query<{ save_id: string }>(
      `SELECT save_id FROM characters WHERE account_id = $1 ORDER BY updated_at DESC`,
      [accountId],
    );
    return rows.map((r) => r.save_id);
  }
}
