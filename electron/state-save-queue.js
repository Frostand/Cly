// Coalescing queue for full persisted-state snapshots.
//
// Research writes and state snapshots intentionally share the one SQLite
// connection owned by the Electron main process. Scheduling each coalesced
// snapshot on the next event-loop turn avoids a second database owner while
// still preventing bursts from producing redundant full rewrites.

const FLUSH_TIMEOUT_MS = 5_000;

export function createStateSaveQueue({ saveState }) {
  if (typeof saveState !== "function") {
    throw new TypeError("createStateSaveQueue requires a saveState function.");
  }

  let busy = false;
  let scheduled = false;
  let closed = false;
  let pending = null;

  const drain = () => {
    if (busy || scheduled || !pending || closed) return;
    scheduled = true;
    setImmediate(() => {
      scheduled = false;
      if (!pending || closed) return;
      const { state, resolvers } = pending;
      pending = null;
      busy = true;
      try {
        const result = saveState(state);
        for (const resolver of resolvers) resolver.resolve(result);
      } catch (error) {
        const failure =
          error instanceof Error ? error : new Error(String(error));
        for (const resolver of resolvers) resolver.reject(failure);
      } finally {
        busy = false;
        drain();
      }
    });
  };

  const save = (state) => {
    if (closed) return Promise.reject(new Error("State save queue is closed."));
    return new Promise((resolve, reject) => {
      if (pending) {
        pending.state = state;
        pending.resolvers.push({ resolve, reject });
      } else {
        pending = { state, resolvers: [{ resolve, reject }] };
      }
      drain();
    });
  };

  const flushAndClose = async () => {
    if (closed) return;
    const deadline = Date.now() + FLUSH_TIMEOUT_MS;
    while ((busy || scheduled || pending) && Date.now() < deadline) {
      drain();
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    if (busy || scheduled || pending) {
      throw new Error("Timed out flushing the state save queue.");
    }
    closed = true;
  };

  return { save, flushAndClose };
}
