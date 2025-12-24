/**
 * Обёртка для Promise с таймаутом
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  operation: string
): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error(`${operation} timeout: превышено ${ms / 1000}с`)),
      ms
    )
  );
  return Promise.race([promise, timeout]);
}
