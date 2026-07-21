export function defineLiteratureSourceAdapter(adapter) {
  if (!adapter || typeof adapter.id !== "string" || !adapter.id.trim()) {
    throw new Error("A literature source adapter requires an id.");
  }
  if (!new Set(["remote", "upload"]).has(adapter.kind)) {
    throw new Error(`Literature adapter ${adapter.id} has an invalid kind.`);
  }
  if (adapter.kind === "remote" && typeof adapter.search !== "function") {
    throw new Error(
      `Remote literature adapter ${adapter.id} requires search().`,
    );
  }
  if (adapter.kind === "upload" && typeof adapter.ingest !== "function") {
    throw new Error(
      `Upload literature adapter ${adapter.id} requires ingest().`,
    );
  }
  return Object.freeze(adapter);
}
