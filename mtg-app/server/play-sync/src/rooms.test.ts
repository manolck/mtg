import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { actionsSince, appendAction, getOrCreateRoom } from './rooms.js';

describe('play-sync rooms', () => {
  it('assigns monotonic seq and supports catchup', () => {
    const room = getOrCreateRoom(`test-${Date.now()}`, 0);
    const a = appendAction(room, { actionId: 'a1', userId: 'u1', action: { type: 'passTurn' } });
    const b = appendAction(room, { actionId: 'a2', userId: 'u2', action: { type: 'passTurn' } });
    assert.equal(a?.seq, 1);
    assert.equal(b?.seq, 2);
    assert.deepEqual(actionsSince(room, 0), [a, b]);
    assert.deepEqual(actionsSince(room, 1), [b]);
    assert.deepEqual(actionsSince(room, 2), []);
  });

  it('dedupes actionId', () => {
    const room = getOrCreateRoom(`test-dedupe-${Date.now()}`, 5);
    const first = appendAction(room, { actionId: 'same', userId: 'u1', action: { type: 'passTurn' } });
    const second = appendAction(room, { actionId: 'same', userId: 'u1', action: { type: 'passTurn' } });
    assert.equal(first?.seq, 6);
    assert.equal(second?.seq, 6);
    assert.equal(room.lastSeq, 6);
  });
});
