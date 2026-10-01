import type { PlayAction, PlayChatDice, PlayChatMessage } from '../types/play';

export const PLAY_CHAT_MAX_MESSAGES = 80;
export const PLAY_CHAT_MAX_TEXT = 240;
export const PLAY_DICE_MAX_COUNT = 20;
export const PLAY_DICE_MIN_FACES = 2;
export const PLAY_DICE_MAX_FACES = 1000;

const DICE_COMMAND = /^\/r(?:oll)?\s+(\d+)\s*d\s*(\d+)\s*$/i;

export function parseDiceCommand(raw: string): { count: number; faces: number } | null {
  const match = DICE_COMMAND.exec(raw.trim());
  if (!match) return null;
  const count = Number(match[1]);
  const faces = Number(match[2]);
  if (!Number.isInteger(count) || !Number.isInteger(faces)) return null;
  if (count < 1 || count > PLAY_DICE_MAX_COUNT) return null;
  if (faces < PLAY_DICE_MIN_FACES || faces > PLAY_DICE_MAX_FACES) return null;
  return { count, faces };
}

export function rollDice(count: number, faces: number, random: () => number = Math.random): number[] {
  const n = Math.max(0, Math.floor(count));
  const sides = Math.max(PLAY_DICE_MIN_FACES, Math.floor(faces));
  const rolls: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const unit = random();
    const clamped = unit >= 1 ? 0.999999999 : unit < 0 ? 0 : unit;
    rolls.push(1 + Math.floor(clamped * sides));
  }
  return rolls;
}

export function sanitizeChatText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, PLAY_CHAT_MAX_TEXT);
}

export function isValidChatDice(dice: PlayChatDice | undefined): dice is PlayChatDice {
  if (!dice) return false;
  const count = Math.floor(dice.count);
  const faces = Math.floor(dice.faces);
  if (count < 1 || count > PLAY_DICE_MAX_COUNT) return false;
  if (faces < PLAY_DICE_MIN_FACES || faces > PLAY_DICE_MAX_FACES) return false;
  if (!Array.isArray(dice.rolls) || dice.rolls.length !== count) return false;
  return dice.rolls.every((value) => {
    const roll = Math.floor(Number(value));
    return roll >= 1 && roll <= faces;
  });
}

export function formatDiceResult(dice: PlayChatDice): string {
  const rolls = dice.rolls.join(', ');
  const total = dice.rolls.reduce((sum, value) => sum + value, 0);
  if (dice.count === 1) return `${dice.count}d${dice.faces} → ${total}`;
  return `${dice.count}d${dice.faces} → ${rolls} (${total})`;
}

export type ComposePlayChatResult =
  | { action: Extract<PlayAction, { type: 'chat' }> }
  | { error: string }
  | null;

export function composePlayChatAction(input: {
  userId: string;
  id: string;
  text: string;
  name?: string;
  created?: number;
  random?: () => number;
}): ComposePlayChatResult {
  const id = input.id.trim().slice(0, 64);
  if (!id) return null;
  const raw = input.text;
  const spec = parseDiceCommand(raw);
  if (spec) {
    const rolls = rollDice(spec.count, spec.faces, input.random);
    return {
      action: {
        type: 'chat',
        userId: input.userId,
        id,
        text: `/r ${spec.count}d${spec.faces}`,
        name: input.name,
        created: input.created,
        dice: { count: spec.count, faces: spec.faces, rolls },
      },
    };
  }
  const text = sanitizeChatText(raw);
  if (!text) return null;
  if (/^\/r(?:oll)?\b/i.test(text)) {
    return { error: 'Usage : /r 1d20' };
  }
  return {
    action: {
      type: 'chat',
      userId: input.userId,
      id,
      text,
      name: input.name,
      created: input.created,
    },
  };
}

export function appendChatMessage(
  messages: PlayChatMessage[] | undefined,
  message: PlayChatMessage,
): PlayChatMessage[] {
  const current = messages || [];
  if (current.some((item) => item.id === message.id)) return current;
  return [...current, message].slice(-PLAY_CHAT_MAX_MESSAGES);
}
