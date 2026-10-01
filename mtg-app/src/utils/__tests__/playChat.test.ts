import {
  composePlayChatAction,
  formatDiceResult,
  parseDiceCommand,
  rollDice,
  sanitizeChatText,
} from '../playChat';

describe('parseDiceCommand', () => {
  it('reads /r NdX', () => {
    expect(parseDiceCommand('/r 1d20')).toEqual({ count: 1, faces: 20 });
    expect(parseDiceCommand('  /roll 2d6  ')).toEqual({ count: 2, faces: 6 });
    expect(parseDiceCommand('/r 1 d 4')).toEqual({ count: 1, faces: 4 });
  });

  it('rejects invalid dice', () => {
    expect(parseDiceCommand('/r d20')).toBeNull();
    expect(parseDiceCommand('/r 1d')).toBeNull();
    expect(parseDiceCommand('/r 0d6')).toBeNull();
    expect(parseDiceCommand('/r 1d1')).toBeNull();
    expect(parseDiceCommand('hello')).toBeNull();
    expect(parseDiceCommand('/r 21d6')).toBeNull();
  });
});

describe('rollDice', () => {
  it('stays inside 1..faces', () => {
    expect(rollDice(3, 6, () => 0)).toEqual([1, 1, 1]);
    expect(rollDice(2, 20, () => 0.999)).toEqual([20, 20]);
  });
});

describe('composePlayChatAction', () => {
  it('builds a text message', () => {
    const result = composePlayChatAction({
      userId: 'u1',
      id: 'm1',
      text: '  salut tout le monde  ',
      name: 'A',
    });
    expect(result).toEqual({
      action: {
        type: 'chat',
        userId: 'u1',
        id: 'm1',
        text: 'salut tout le monde',
        name: 'A',
        created: undefined,
      },
    });
  });

  it('rolls dice once and stores the result', () => {
    const result = composePlayChatAction({
      userId: 'u1',
      id: 'm2',
      text: '/r 2d6',
      name: 'A',
      random: () => 0.5,
    });
    expect(result).toEqual({
      action: {
        type: 'chat',
        userId: 'u1',
        id: 'm2',
        text: '/r 2d6',
        name: 'A',
        created: undefined,
        dice: { count: 2, faces: 6, rolls: [4, 4] },
      },
    });
  });

  it('hints on a bad /r command', () => {
    expect(composePlayChatAction({ userId: 'u1', id: 'm3', text: '/r nope' })).toEqual({
      error: 'Usage : /r 1d20',
    });
  });

  it('ignores empty text', () => {
    expect(composePlayChatAction({ userId: 'u1', id: 'm4', text: '   ' })).toBeNull();
  });
});

describe('formatDiceResult', () => {
  it('shows a single die without a sum', () => {
    expect(formatDiceResult({ count: 1, faces: 20, rolls: [17] })).toBe('1d20 → 17');
  });

  it('sums several dice', () => {
    expect(formatDiceResult({ count: 2, faces: 6, rolls: [3, 5] })).toBe('2d6 → 3, 5 (8)');
  });
});

describe('sanitizeChatText', () => {
  it('collapses whitespace and truncates', () => {
    expect(sanitizeChatText('  a   b  ')).toBe('a b');
  });
});
