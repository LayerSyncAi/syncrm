/**
 * The website's polite fetch pool for PropertyBook previews: `concurrency`
 * workers, each pausing `perSlotDelayMs` between listings, cancellable
 * between items.
 */
export async function runPool<T, R>(
  items: T[],
  concurrency: number,
  perSlotDelayMs: number,
  worker: (item: T, index: number) => Promise<R>,
  onProgress: (completed: number) => void,
  shouldCancel: () => boolean
): Promise<{ successes: R[]; failed: number }> {
  const successes: R[] = [];
  let failed = 0;
  let completed = 0;
  let next = 0;
  const runWorker = async () => {
    while (true) {
      if (shouldCancel()) return;
      const i = next++;
      if (i >= items.length) return;
      try {
        successes.push(await worker(items[i]!, i));
      } catch {
        failed++;
      }
      completed++;
      onProgress(completed);
      if (next < items.length && !shouldCancel()) await new Promise((r) => setTimeout(r, perSlotDelayMs));
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runWorker));
  return { successes, failed };
}
