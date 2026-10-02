import { useDeferredSingleTap, MOBILE_DOUBLE_TAP_GUARD_MS } from '../useDeferredSingleTap';
import { createDeferredSingleTapHandler } from '../useDeferredSingleTap';
import { isCoarsePointer } from '../../utils/coarsePointer';

jest.mock('../../utils/coarsePointer', () => ({
  isCoarsePointer: jest.fn(() => true),
}));

const mockIsCoarse = isCoarsePointer as jest.Mock;

describe('createDeferredSingleTapHandler', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockIsCoarse.mockReturnValue(true);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('defers single tap on coarse pointer', () => {
    const onSingle = jest.fn();
    const { handleTap, dispose } = createDeferredSingleTapHandler(onSingle);
    handleTap();
    expect(onSingle).not.toHaveBeenCalled();
    jest.advanceTimersByTime(MOBILE_DOUBLE_TAP_GUARD_MS);
    expect(onSingle).toHaveBeenCalledTimes(1);
    dispose();
  });

  it('cancels enlarge on double tap and calls onDoubleTap', () => {
    const onSingle = jest.fn();
    const onDouble = jest.fn();
    const { handleTap, dispose } = createDeferredSingleTapHandler(onSingle, {
      onDoubleTap: onDouble,
    });
    handleTap();
    handleTap();
    jest.advanceTimersByTime(MOBILE_DOUBLE_TAP_GUARD_MS);
    expect(onSingle).not.toHaveBeenCalled();
    expect(onDouble).toHaveBeenCalledTimes(1);
    dispose();
  });

  it('fires immediately on fine pointer', () => {
    mockIsCoarse.mockReturnValue(false);
    const onSingle = jest.fn();
    const { handleTap, dispose } = createDeferredSingleTapHandler(onSingle);
    handleTap();
    expect(onSingle).toHaveBeenCalledTimes(1);
    dispose();
  });
});

// Keep hook export referenced for coverage of re-exports used by components
describe('useDeferredSingleTap export', () => {
  it('exports the hook', () => {
    expect(typeof useDeferredSingleTap).toBe('function');
  });
});
