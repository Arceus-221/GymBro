/** A result is current only until a newer action invalidates its version. */
export function createRequestVersion() {
  let version = 0;
  return {
    next: () => ++version,
    invalidate: () => { version += 1; },
    isCurrent: (token) => token === version,
  };
}
