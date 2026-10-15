import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { EMPTY_EQUIPMENT } from '@empery/shared';
import type { PlayerSave } from '@empery/shared';
import type { HavenNpcLike } from './haven-npc-plugin.js';
import { clearItemsCache, getItem } from './items.js';
import { contentRoot } from './paths.js';
import { applyStatsToSave } from './stats.js';
import { applyTeacherChoice, generateTeacherDialogue } from './teacher-lesson-dialogue.js';
import {
  HAVEN_LAVR_LESSONS_FLAG,
  LAVR_EXAM_NEED_LESSONS_MESSAGE,
  LAVR_EXAM_REWARD_ADENA,
  LAVR_LESSON_BUFF_AMOUNT,
  LAVR_LESSON_BUFF_NAME,
  LAVR_LESSON_COST,
  LAVR_LESSONS_FOR_EXAM,
  LAVR_NOTES_ITEM_ID,
  TEACHER_EXAM_COMPLETE_FLAG,
  takeLavrExam,
  takeLavrLesson,
} from './teacher-lesson.js';

function testSave(overrides: Partial<PlayerSave> = {}): PlayerSave {
  const now = new Date().toISOString();
  return applyStatsToSave({
    id: 'test-teacher-player',
    name: 'HavenAdventurer',
    race: 'human',
    profession: 'mystic',
    level: 2,
    xp: 0,
    hp: 40,
    maxHp: 100,
    mp: 10,
    maxMp: 50,
    location: 'empery_haven',
    adena: 100,
    inventory: [],
    equipment: { ...EMPTY_EQUIPMENT },
    skillLevels: {},
    skillCooldowns: {},
    questFlags: {},
    karma: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

function loadTeacherNpc(): HavenNpcLike {
  return parseYaml(readFileSync(join(contentRoot, 'npcs/town_teacher.yaml'), 'utf8')) as HavenNpcLike;
}

const otherNpc: HavenNpcLike = {
  id: 'town_priest',
  name: 'Отец Кассий',
  defaultGreeting: 'Мир тебе.',
  choices: [],
  nodes: {},
};

describe('lavr_notes item', () => {
  beforeAll(() => {
    clearItemsCache();
  });

  it('loads unsellable lore notes from haven-teacher.yaml', () => {
    const item = getItem(LAVR_NOTES_ITEM_ID);
    expect(item?.name).toBe('Записки Лавра');
    expect(item?.slot).toBe('material');
    expect(item?.unsellable).toBe(true);
    expect(item?.rarity).toBe('uncommon');
  });
});

describe('takeLavrLesson', () => {
  it('rejects the lesson if the player cannot pay', () => {
    const s0 = testSave({ adena: 5 });
    const res = takeLavrLesson(s0);
    expect(res.ok).toBe(false);
    expect(res.save.adena).toBe(5);
    expect(res.save.questFlags[HAVEN_LAVR_LESSONS_FLAG]).toBeUndefined();
    expect(res.save.questFlags.buff_sup_lavr_lesson_val).toBeUndefined();
    expect(res.message).toContain(String(LAVR_LESSON_COST));
  });

  it('applies mAtk buff, deducts adena and increments haven_lavr_lessons', () => {
    const s0 = testSave({ adena: 40 });
    const res = takeLavrLesson(s0);
    expect(res.ok).toBe(true);
    expect(res.save.adena).toBe(40 - LAVR_LESSON_COST);
    expect(res.save.questFlags.buff_sup_lavr_lesson_val).toBe(LAVR_LESSON_BUFF_AMOUNT);
    expect(res.save.questFlags.buff_sup_lavr_lesson_stat).toBe('mAtk');
    expect(res.save.questFlags.buff_sup_lavr_lesson_name).toBe(LAVR_LESSON_BUFF_NAME);
    expect(typeof res.save.questFlags.buff_sup_lavr_lesson_until).toBe('string');
    expect(res.save.questFlags[HAVEN_LAVR_LESSONS_FLAG]).toBe(1);
    expect(res.message).toContain(LAVR_LESSON_BUFF_NAME);
  });

  it('increments haven_lavr_lessons on each successful lesson', () => {
    const first = takeLavrLesson(testSave({ adena: 30 }));
    const second = takeLavrLesson(first.save);
    expect(second.ok).toBe(true);
    expect(second.save.questFlags[HAVEN_LAVR_LESSONS_FLAG]).toBe(2);
    expect(second.save.adena).toBe(30 - LAVR_LESSON_COST * 2);
  });
});

describe('takeLavrExam', () => {
  it('fails before two lessons with the required copy', () => {
    const none = takeLavrExam(testSave());
    expect(none.ok).toBe(false);
    expect(none.message).toBe(LAVR_EXAM_NEED_LESSONS_MESSAGE);
    expect(none.save.inventory).not.toContain(LAVR_NOTES_ITEM_ID);

    const one = takeLavrExam(testSave({ questFlags: { [HAVEN_LAVR_LESSONS_FLAG]: 1 } }));
    expect(one.ok).toBe(false);
    expect(one.message).toBe(LAVR_EXAM_NEED_LESSONS_MESSAGE);
    expect(one.save.adena).toBe(100);
  });

  it('grants notes, 35 adena and complete flag once after two lessons', () => {
    const s0 = testSave({
      adena: 20,
      questFlags: { [HAVEN_LAVR_LESSONS_FLAG]: LAVR_LESSONS_FOR_EXAM },
    });
    const res = takeLavrExam(s0);
    expect(res.ok).toBe(true);
    expect(res.save.inventory).toContain(LAVR_NOTES_ITEM_ID);
    expect(res.save.adena).toBe(20 + LAVR_EXAM_REWARD_ADENA);
    expect(res.save.questFlags[TEACHER_EXAM_COMPLETE_FLAG]).toBe(true);
    expect(res.save.questFlags[HAVEN_LAVR_LESSONS_FLAG]).toBe(2);
  });

  it('rejects a repeat exam without extra notes or adena', () => {
    const first = takeLavrExam(
      testSave({
        adena: 10,
        questFlags: { [HAVEN_LAVR_LESSONS_FLAG]: 3 },
      }),
    );
    expect(first.ok).toBe(true);

    const again = takeLavrExam(first.save);
    expect(again.ok).toBe(false);
    expect(again.save.adena).toBe(first.save.adena);
    expect(again.save.inventory.filter((id) => id === LAVR_NOTES_ITEM_ID)).toHaveLength(1);
    expect(again.message).toContain('уже сдан');
  });
});

describe('teacher lesson dialogue generate/apply', () => {
  it('returns null for the wrong npc', () => {
    const save = testSave();
    expect(generateTeacherDialogue(otherNpc, save)).toBeNull();
    expect(applyTeacherChoice(save, otherNpc, 'teacher_lesson')).toBeNull();
  });

  it('keeps flavor choices, always offers lesson, and hides exam until two lessons', () => {
    const npc = loadTeacherNpc();

    const idle = generateTeacherDialogue(npc, testSave());
    expect(idle).not.toBeNull();
    const idleIds = idle!.choices.map((c) => c.id);
    expect(idleIds).toEqual(
      expect.arrayContaining(['teacher_lesson', 'teacher_map', 'teacher_praise', 'teacher_leave']),
    );
    expect(idleIds).not.toContain('teacher_exam');
    expect(idle!.text).toContain('Буквы');

    const one = generateTeacherDialogue(
      npc,
      testSave({ questFlags: { [HAVEN_LAVR_LESSONS_FLAG]: 1 } }),
    );
    expect(one!.choices.map((c) => c.id)).not.toContain('teacher_exam');
    expect(one!.text).toContain('Один урок');

    const ready = generateTeacherDialogue(
      npc,
      testSave({ questFlags: { [HAVEN_LAVR_LESSONS_FLAG]: 2 } }),
    );
    const readyIds = ready!.choices.map((c) => c.id);
    expect(readyIds).toContain('teacher_exam');
    expect(readyIds).toContain('teacher_lesson');
    expect(ready!.text).toContain('экзамен');

    const done = generateTeacherDialogue(
      npc,
      testSave({
        questFlags: {
          [HAVEN_LAVR_LESSONS_FLAG]: 2,
          [TEACHER_EXAM_COMPLETE_FLAG]: true,
        },
      }),
    );
    expect(done!.choices.map((c) => c.id)).not.toContain('teacher_exam');
    expect(done!.text).toContain('Экзамен закрыт');
  });

  it('applies mechanic choices and returns null for YAML flavor ids', () => {
    const npc = loadTeacherNpc();
    const save = testSave({ adena: 40 });

    const lesson = applyTeacherChoice(save, npc, 'teacher_lesson');
    expect(lesson).not.toBeNull();
    expect(lesson!.save.questFlags[HAVEN_LAVR_LESSONS_FLAG]).toBe(1);
    expect(lesson!.save.questFlags.buff_sup_lavr_lesson_val).toBe(LAVR_LESSON_BUFF_AMOUNT);
    expect(lesson!.townMessage).toContain(LAVR_LESSON_BUFF_NAME);
    expect(lesson!.followUp?.choices.map((c) => c.id)).not.toContain('teacher_exam');

    const second = applyTeacherChoice(lesson!.save, npc, 'teacher_lesson');
    expect(second!.save.questFlags[HAVEN_LAVR_LESSONS_FLAG]).toBe(2);
    expect(second!.followUp?.choices.map((c) => c.id)).toContain('teacher_exam');

    const exam = applyTeacherChoice(second!.save, npc, 'teacher_exam');
    expect(exam!.save.inventory).toContain(LAVR_NOTES_ITEM_ID);
    expect(exam!.save.adena).toBe(40 - LAVR_LESSON_COST * 2 + LAVR_EXAM_REWARD_ADENA);
    expect(exam!.save.questFlags[TEACHER_EXAM_COMPLETE_FLAG]).toBe(true);
    expect(exam!.followUp?.choices.map((c) => c.id)).not.toContain('teacher_exam');

    expect(applyTeacherChoice(save, npc, 'teacher_map')).toBeNull();
    expect(applyTeacherChoice(save, npc, 'teacher_praise')).toBeNull();
    expect(applyTeacherChoice(save, npc, 'teacher_leave')).toBeNull();
    expect(applyTeacherChoice(save, npc, 'teacher_map_bye')).toBeNull();
    expect(applyTeacherChoice(save, npc, 'teacher_praise_bye')).toBeNull();
  });

  it('exam apply before two lessons fails with required copy', () => {
    const npc = loadTeacherNpc();
    const res = applyTeacherChoice(testSave({ adena: 50 }), npc, 'teacher_exam');
    expect(res).not.toBeNull();
    expect(res!.save.adena).toBe(50);
    expect(res!.followUp?.text).toBe(LAVR_EXAM_NEED_LESSONS_MESSAGE);
  });
});
