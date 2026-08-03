export const withTimeout = <T>(
  operation: PromiseLike<T>,
  timeoutMs: number,
  label: string
): Promise<T> => (
  new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out. Please check your connection and try again.`));
    }, timeoutMs);

    Promise.resolve(operation).then(
      value => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      error => {
        clearTimeout(timeoutId);
        reject(error);
      }
    );
  })
);
