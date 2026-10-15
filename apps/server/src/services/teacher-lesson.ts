/**
 * Haven teacher Lavr (town_teacher): paid wanderer lesson + one-time exam.
 * Dialogue wiring lives in teacher-lesson-dialogue.ts — do not add logic to dialogue.ts from here.
 */
import type { PlayerSave } from '@empery/shared';
import { applyNamedBuff } from './ally-buffs.js';
import { appendItemsToSave } from './inventory-bag.js';
import { applyStatsToSave } from './stats.js';
import { worldEvents } from './world-events.js';

export const LAVR_LESSON_COST = 10;
export const LAVR_EXAM_REWARD_ADENA = 35;
export const LAVR_LESSONS_FOR_EXAM = 2;
export const LAVR_NOTES_ITEM_ID = 'lavr_notes';

export const HAVEN_LAVR_LESSONS_FLAG = 'haven_lavr_lessons';
export const TEACHER_EXAM_COMPLETE_FLAG = 'quest_teacher_exam_complete';

export const LAVR_LESSON_BUFF_ID = 'lavr_lesson';
export const LAVR_LESSON_BUFF_STAT = 'mAtk' as const;
export const LAVR_LESSON_BUFF_NAME = 'Урок Лавра';
export const LAVR_LESSON_BUFF_AMOUNT = 12;
export const LAVR_LESSON_DURATION_MS = 25 * 60 * 1000;

export const LAVR_EXAM_NEED_LESSONS_MESSAGE = 'Сначала два урока';

export interface TeacherLessonResult {
  save: PlayerSave;
  ok: boolean;
  message: string;
}

export function lavrLessonCount(save: PlayerSave): number {
  return Number(save.questFlags[HAVEN_LAVR_LESSONS_FLAG] ?? 0) || 0;
}

export function isTeacherExamReady(save: PlayerSave): boolean {
  return lavrLessonCount(save) >= LAVR_LESSONS_FOR_EXAM && !save.questFlags[TEACHER_EXAM_COMPLETE_FLAG];
}

function publish(save: PlayerSave, action: string, extra: Record<string, unknown> = {}): void {
  void worldEvents.publish({
    type: 'PLAYER_ACTION',
    action: 'DIALOGUE',
    playerId: save.id,
    locationId: save.location,
    payload: { action, ...extra },
    timestamp: Date.now(),
  });
}

/** Платный урок странника: бафф «Урок Лавра» (+mAtk) и счётчик haven_lavr_lessons. */
export function takeLavrLesson(save: PlayerSave): TeacherLessonResult {
  const currentAdena = save.adena ?? 0;
  if (currentAdena < LAVR_LESSON_COST) {
    return {
      save,
      ok: false,
      message: `Урок стоит ${LAVR_LESSON_COST} адены. Мел и конспект не даром.`,
    };
  }

  let next: PlayerSave = {
    ...save,
    adena: currentAdena - LAVR_LESSON_COST,
    questFlags: {
      ...save.questFlags,
      [HAVEN_LAVR_LESSONS_FLAG]: lavrLessonCount(save) + 1,
    },
  };

  next = applyNamedBuff(next, {
    buffId: LAVR_LESSON_BUFF_ID,
    buffStat: LAVR_LESSON_BUFF_STAT,
    buffName: LAVR_LESSON_BUFF_NAME,
    amount: LAVR_LESSON_BUFF_AMOUNT,
    durationMs: LAVR_LESSON_DURATION_MS,
  });
  const finalSave = applyStatsToSave(next);

  publish(finalSave, 'LAVR_LESSON', { cost: LAVR_LESSON_COST });
  return {
    save: finalSave,
    ok: true,
    message:
      'Лавр стучит указкой по конспекту: формулы и ударение на слоге. Получен бафф «Урок Лавра» (+12 к маг. атаке на 25 мин).',
  };
}

/** Разовый экзамен после двух уроков: записки Лавра + 35 адены. */
export function takeLavrExam(save: PlayerSave): TeacherLessonResult {
  if (save.questFlags[TEACHER_EXAM_COMPLETE_FLAG]) {
    return {
      save,
      ok: false,
      message: 'Экзамен уже сдан. Конспект у тебя — второй раз мел не точу.',
    };
  }

  if (lavrLessonCount(save) < LAVR_LESSONS_FOR_EXAM) {
    return { save, ok: false, message: LAVR_EXAM_NEED_LESSONS_MESSAGE };
  }

  const withNotes = appendItemsToSave(save, [LAVR_NOTES_ITEM_ID]);
  const next = applyStatsToSave({
    ...withNotes,
    adena: (withNotes.adena ?? 0) + LAVR_EXAM_REWARD_ADENA,
    questFlags: {
      ...withNotes.questFlags,
      [TEACHER_EXAM_COMPLETE_FLAG]: true,
    },
  });

  publish(next, 'LAVR_EXAM', { rewardAdena: LAVR_EXAM_REWARD_ADENA });
  return {
    save: next,
    ok: true,
    message:
      'Лавр кивает: «Письмо ровное, мысль не путается.» Держи записки и 35 адены — стипендия странника.',
  };
}
