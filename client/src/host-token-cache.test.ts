import { describe, expect, it } from 'vitest';
import { HostTokenCache } from './host-token-cache';

const blockedStorage = {
  getItem(): never {
    throw new Error('storage blocked');
  },
  setItem(): never {
    throw new Error('storage blocked');
  },
  removeItem(): never {
    throw new Error('storage blocked');
  }
};

describe('HostTokenCache', () => {
  it('restores the active display room across a page reload and clears it with the credential', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key)
    };

    const firstPage = new HostTokenCache(storage);
    firstPage.set('ABCD', 'host-token');

    const reloadedPage = new HostTokenCache(storage);
    expect(reloadedPage.activeRoomCode()).toBe('ABCD');
    expect(reloadedPage.get('ABCD')).toBe('host-token');

    reloadedPage.delete('ABCD');
    expect(new HostTokenCache(storage).activeRoomCode()).toBeNull();
  });

  it('keeps the current host credential available when storage is blocked', () => {
    const cache = new HostTokenCache(blockedStorage);

    cache.set('ABCD', 'host-token');

    expect(cache.get('ABCD')).toBe('host-token');
    cache.delete('ABCD');
    expect(cache.get('ABCD')).toBeNull();
  });

  it('does not let a stale persisted token override a write that could not persist', () => {
    const storage = {
      getItem: () => 'stale-token',
      setItem: () => {
        throw new Error('quota exceeded');
      },
      removeItem: () => {}
    };
    const cache = new HostTokenCache(storage);

    cache.set('ABCD', 'current-token');

    expect(cache.get('ABCD')).toBe('current-token');
  });
});
