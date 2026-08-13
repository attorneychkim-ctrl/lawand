export function createSingleFlight() {
  const pending = new Map<string, Promise<unknown>>();

  async function run<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const existing = pending.get(key);
    if (existing) return existing as Promise<T>;

    const next = operation();
    pending.set(key, next);
    try {
      return await next;
    } finally {
      if (pending.get(key) === next) pending.delete(key);
    }
  }

  return { run };
}
