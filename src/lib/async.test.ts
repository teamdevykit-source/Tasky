import { afterEach, describe, expect, it, vi } from 'vitest';
import { withTimeout } from './async';

afterEach(() => {
  vi.useRealTimers();
});

describe('withTimeout', () => {
  it('returns a result that completes before the deadline', async () => {
    await expect(withTimeout(Promise.resolve('ready'), 1000, 'Workspace')).resolves.toBe('ready');
  });

  it('preserves an operation error', async () => {
    const failure = new Error('Database unavailable');
    await expect(withTimeout(Promise.reject(failure), 1000, 'Workspace')).rejects.toBe(failure);
  });

  it('rejects a stalled operation with a retryable message', async () => {
    vi.useFakeTimers();
    const result = withTimeout(new Promise<never>(() => undefined), 1000, 'Workspace');
    const expectation = expect(result).rejects.toThrow(
      'Workspace timed out. Please check your connection and try again.'
    );

    await vi.advanceTimersByTimeAsync(1000);
    await expectation;
  });
});
