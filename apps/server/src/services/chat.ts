import { randomUUID } from 'node:crypto';
import type {
  ChatChannel,
  MultiplayerChatMessage,
  MultiplayerPlayerPresence,
} from '@empery/shared';

export const CHAT_MAX_LENGTH = 200;
export const CHAT_MIN_INTERVAL_MS = 400;

export function sanitizeChatText(raw: string): string | null {
  let printable = '';
  for (const char of raw.slice(0, CHAT_MAX_LENGTH * 4)) {
    const code = char.charCodeAt(0);
    printable += code <= 0x1f || code === 0x7f ? ' ' : char;
  }
  const text = printable.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.slice(0, CHAT_MAX_LENGTH);
}

export function buildChatMessage(input: {
  channel: ChatChannel;
  from: MultiplayerPlayerPresence;
  text: string;
  to?: MultiplayerPlayerPresence;
}): MultiplayerChatMessage {
  return {
    id: randomUUID(),
    channel: input.channel,
    fromSaveId: input.from.saveId,
    fromName: input.from.name,
    text: input.text,
    ts: Date.now(),
    toSaveId: input.to?.saveId,
    toName: input.to?.name,
  };
}
