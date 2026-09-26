import { createSeqActionBuffer } from '../playSyncSeqBuffer';
import type { SyncedPlayAction } from '../playSyncProtocol';

function entry(seq: number, actionId = `a${seq}`): SyncedPlayAction {
  return {
    seq,
    actionId,
    userId: 'u1',
    action: { type: 'passTurn' },
    created: new Date().toISOString(),
  };
}

describe('createSeqActionBuffer', () => {
  it('applies consecutive seq in order', () => {
    const applied: number[] = [];
    const buf = createSeqActionBuffer({
      onApply: (e) => applied.push(e.seq),
    });
    buf.reset(0);
    expect(buf.push(entry(1))).toBe('ok');
    expect(buf.push(entry(2))).toBe('ok');
    expect(applied).toEqual([1, 2]);
    expect(buf.lastSeq).toBe(2);
  });

  it('buffers out-of-order then flushes', () => {
    const applied: number[] = [];
    const buf = createSeqActionBuffer({
      onApply: (e) => applied.push(e.seq),
    });
    buf.reset(0);
    expect(buf.push(entry(2))).toBe('ok');
    expect(applied).toEqual([]);
    expect(buf.pendingCount()).toBe(1);
    expect(buf.push(entry(1))).toBe('ok');
    expect(applied).toEqual([1, 2]);
    expect(buf.lastSeq).toBe(2);
  });

  it('acknowledge advances seq without apply', () => {
    const applied: number[] = [];
    const buf = createSeqActionBuffer({
      onApply: (e) => applied.push(e.seq),
    });
    buf.reset(0);
    expect(buf.acknowledge(1, 'mine')).toBe('ok');
    expect(applied).toEqual([]);
    expect(buf.lastSeq).toBe(1);
    expect(buf.push(entry(2))).toBe('ok');
    expect(applied).toEqual([2]);
  });

  it('returns reload when gap exceeds maxBuffer', () => {
    const buf = createSeqActionBuffer({
      maxBuffer: 3,
      onApply: () => {},
    });
    buf.reset(0);
    expect(buf.push(entry(10))).toBe('reload');
  });
});
