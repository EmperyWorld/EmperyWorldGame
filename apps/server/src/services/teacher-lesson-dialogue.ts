/**
 * Dialogue plugin for Учитель Лавр (town_teacher).
 * Mechanic ids: teacher_lesson / teacher_exam. Flavor teacher_map / teacher_praise stay YAML.
 */
import type { DialogueResponse, PlayerSave } from '@empery/shared';
import { mapDialogueChoices, withDialogueScene } from './dialogue-portraits.js';
import {
  filterHavenChoices,
  type HavenNpcChoice,
  type HavenNpcChoiceResult,
  type HavenNpcFeaturePlugin,
  type HavenNpcLike,
} from './haven-npc-plugin.js';
import {
  isTeacherExamReady,
  lavrLessonCount,
  takeLavrExam,
  takeLavrLesson,
  TEACHER_EXAM_COMPLETE_FLAG,
  type TeacherLessonResult,
} from './teacher-lesson.js';

export const TEACHER_NPC_ID = 'town_teacher';

const MECHANIC_CHOICES = new Set(['teacher_lesson', 'teacher_exam']);

const YAML_PASSTHROUGH = new Set([
  'teacher_map',
  'teacher_praise',
  'teacher_leave',
  'teacher_map_bye',
  'teacher_praise_bye',
]);

const LESSON_CHOICE: HavenNpcChoice = {
  id: 'teacher_lesson',
  label: 'Взять урок странника (10 адены)',
  flag: '_teacher_lesson',
  portrait: 'work',
};

const EXAM_CHOICE: HavenNpcChoice = {
  id: 'teacher_exam',
  label: 'Сдать экзамен',
  flag: '_teacher_exam',
  portrait: 'happy',
};

function yamlOrFallback(npc: HavenNpcLike, fallback: HavenNpcChoice): HavenNpcChoice {
  return npc.choices.find((choice) => choice.id === fallback.id) ?? fallback;
}

function greetingFor(npc: HavenNpcLike, save: PlayerSave): { text: string; portrait: string } {
  if (save.questFlags[TEACHER_EXAM_COMPLETE_FLAG]) {
    return {
      text: 'Экзамен закрыт. Записки при тебе — три раздела книги навыков не перепутаешь. Урок всё ещё открыт, если ум просит повторения.',
      portrait: 'happy',
    };
  }

  const lessons = lavrLessonCount(save);
  if (lessons >= 2) {
    return {
      text: 'Два урока за плечами. Пора к доске: сдай экзамен — и конспект станет твоим.',
      portrait: 'serious',
    };
  }
  if (lessons === 1) {
    return {
      text: 'Один урок есть. Второй — и можно к экзамену. Буквы тоже оружие, странник.',
      portrait: 'work',
    };
  }
  return { text: npc.defaultGreeting, portrait: 'neutral' };
}

export function teacherMenuChoices(npc: HavenNpcLike, save: PlayerSave): HavenNpcChoice[] {
  const byId = new Map<string, HavenNpcChoice>();
  for (const choice of npc.choices ?? []) {
    byId.set(choice.id, choice);
  }
  byId.set('teacher_lesson', yamlOrFallback(npc, LESSON_CHOICE));
  if (isTeacherExamReady(save)) {
    byId.set('teacher_exam', yamlOrFallback(npc, EXAM_CHOICE));
  } else {
    byId.delete('teacher_exam');
  }

  const ordered: HavenNpcChoice[] = [];
  for (const id of ['teacher_lesson', 'teacher_exam', 'teacher_map', 'teacher_praise', 'teacher_leave']) {
    const choice = byId.get(id);
    if (choice) {
      ordered.push(choice);
      byId.delete(id);
    }
  }
  ordered.push(...byId.values());

  return filterHavenChoices(ordered, save);
}

function followUpFromResult(
  npc: HavenNpcLike,
  result: TeacherLessonResult,
  okPortrait: string,
): HavenNpcChoiceResult {
  return {
    save: result.save,
    townMessage: result.message,
    followUp: withDialogueScene(npc, {
      text: result.message,
      choices: mapDialogueChoices(npc, teacherMenuChoices(npc, result.save)),
      portrait: result.ok ? okPortrait : 'serious',
    }),
  };
}

export function generateTeacherDialogue(
  npc: HavenNpcLike,
  save: PlayerSave,
): DialogueResponse | null {
  if (npc.id !== TEACHER_NPC_ID) return null;
  const scene = greetingFor(npc, save);
  return withDialogueScene(npc, {
    text: scene.text,
    choices: mapDialogueChoices(npc, teacherMenuChoices(npc, save)),
    portrait: scene.portrait,
  });
}

export function applyTeacherChoice(
  save: PlayerSave,
  npc: HavenNpcLike,
  choiceId: string,
): HavenNpcChoiceResult | null {
  if (npc.id !== TEACHER_NPC_ID) return null;
  if (YAML_PASSTHROUGH.has(choiceId) || choiceId.endsWith('_bye')) return null;
  if (!MECHANIC_CHOICES.has(choiceId)) return null;

  if (choiceId === 'teacher_lesson') {
    return followUpFromResult(npc, takeLavrLesson(save), 'work');
  }
  return followUpFromResult(npc, takeLavrExam(save), 'happy');
}

export const teacherLessonPlugin: HavenNpcFeaturePlugin = {
  generate: generateTeacherDialogue,
  apply: (npc, save, choiceId) => applyTeacherChoice(save, npc, choiceId),
};
