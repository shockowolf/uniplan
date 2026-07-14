export function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

export async function remainsBlocked(promise: Promise<unknown>, waitMs = 40) {
  const outcome = await Promise.race([
    promise.then(
      () => 'settled',
      () => 'settled',
    ),
    new Promise<'blocked'>((resolve) =>
      setTimeout(() => resolve('blocked'), waitMs),
    ),
  ]);
  return outcome === 'blocked';
}
