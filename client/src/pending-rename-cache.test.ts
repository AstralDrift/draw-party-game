import { describe, expect, it } from 'vitest';
import {
  coalescePendingRenameIntent,
  createPendingRenameIntent
} from './controller';
import {
  MAX_PENDING_RENAME_BYTES,
  PendingRenameCache,
  PENDING_RENAME_STORAGE_KEY
} from './pending-rename-cache';

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe('PendingRenameCache', () => {
  it('restores only the latest explicit rename as queued after a refresh', () => {
    const storage = new MemoryStorage();
    const bob = createPendingRenameIntent('Bob', 'Ava', true, 4);
    const bobThenCarol = coalescePendingRenameIntent(bob, 'Carol');

    expect(new PendingRenameCache(storage, () => 1_000).save('ABCD', 'p1', bobThenCarol)).toBe(
      true
    );
    expect(new PendingRenameCache(storage, () => 1_001).restore('ABCD', 'p1')).toEqual(
      createPendingRenameIntent('Carol', 'Ava', false, 0)
    );
  });

  it('rejects mismatched, oversized, malformed, and unavailable storage without throwing', () => {
    const storage = new MemoryStorage();
    const cache = new PendingRenameCache(storage, () => 2_000);
    cache.save('ABCD', 'p1', createPendingRenameIntent('Avery', 'Ava', true, 4));
    expect(cache.restore('WXYZ', 'p1')).toBeNull();
    expect(storage.getItem(PENDING_RENAME_STORAGE_KEY)).toBeNull();

    storage.setItem(PENDING_RENAME_STORAGE_KEY, '{not-json');
    expect(cache.restore('ABCD', 'p1')).toBeNull();
    storage.setItem(PENDING_RENAME_STORAGE_KEY, 'x'.repeat(MAX_PENDING_RENAME_BYTES + 1));
    expect(cache.restore('ABCD', 'p1')).toBeNull();

    const unavailable = new PendingRenameCache(
      {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
        removeItem: () => {
          throw new Error('blocked');
        }
      },
      () => 2_000
    );
    expect(
      unavailable.save('ABCD', 'p1', createPendingRenameIntent('Avery', 'Ava', true, 4))
    ).toBe(false);
    expect(unavailable.restore('ABCD', 'p1')).toBeNull();
    expect(() => unavailable.clear()).not.toThrow();
  });
});
