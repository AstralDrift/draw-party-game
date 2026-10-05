import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUuid } from './random-id';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('randomUuid', () => {
  it('uses the native secure UUID implementation when available', () => {
    const nativeId = '98765432-1234-4678-9abc-123456789abc';
    const randomUUID = vi.fn(() => nativeId);
    const getRandomValues = vi.fn();
    vi.stubGlobal('crypto', { randomUUID, getRandomValues });

    expect(randomUuid()).toBe(nativeId);
    expect(randomUUID).toHaveBeenCalledOnce();
    expect(getRandomValues).not.toHaveBeenCalled();
  });

  it('uses 16 secure random bytes with UUID v4 and variant bits when randomUUID is absent', () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => {
      bytes.set(Array.from({ length: 16 }, (_, index) => index));
      return bytes;
    });
    vi.stubGlobal('crypto', { getRandomValues });

    expect(randomUuid()).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f');
    expect(getRandomValues).toHaveBeenCalledOnce();
    expect(getRandomValues.mock.calls[0][0]).toBeInstanceOf(Uint8Array);
    expect(getRandomValues.mock.calls[0][0]).toHaveLength(16);
  });

  it('fails when secure random generation is unavailable', () => {
    vi.stubGlobal('crypto', {});
    expect(() => randomUuid()).toThrow(TypeError);
  });
});
