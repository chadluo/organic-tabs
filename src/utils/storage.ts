/**
 * Minimal interface for a key-value storage backend.
 * The real adapter wraps browser.storage.local; an in-memory implementation
 * satisfies the same interface for tests.
 */
export interface StorageBackend {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

const localBackend: StorageBackend = {
  async get(key) {
    const result = await browser.storage.local.get(key);
    return result[key];
  },
  async set(key, value) {
    await browser.storage.local.set({ [key]: value });
  },
};

/** Same as localBackend, but cleared when the browser restarts. */
export const sessionBackend: StorageBackend = {
  async get(key) {
    const result = await browser.storage.session.get(key);
    return result[key];
  },
  async set(key, value) {
    await browser.storage.session.set({ [key]: value });
  },
};

/**
 * Typed handle for a single storage key. Accepts an optional backend so
 * callers can substitute an in-memory implementation in tests.
 */
export class StorageEntry<T> {
  constructor(
    private readonly key: string,
    private readonly backend: StorageBackend = localBackend,
  ) {}

  get(): Promise<T | undefined> {
    return this.backend.get(this.key) as Promise<T | undefined>;
  }

  set(value: T): Promise<void> {
    return this.backend.set(this.key, value);
  }

  /** Read-modify-write. Passes the current value (or undefined) to fn and writes the result. */
  async update(fn: (current: T | undefined) => T): Promise<void> {
    await this.set(fn(await this.get()));
  }
}
