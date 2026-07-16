import { DatabaseSync } from "node:sqlite";
import { parentPort, workerData } from "node:worker_threads";
import { createClyDevSessionRepository } from "./session-repository.js";

const db = new DatabaseSync(workerData.databasePath);
db.exec(
  "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;",
);

try {
  if (workerData.mode === "lock") {
    db.exec("BEGIN IMMEDIATE");
    parentPort.postMessage({ locked: true });
    Atomics.wait(
      new Int32Array(new SharedArrayBuffer(4)),
      0,
      0,
      workerData.holdMs,
    );
    db.exec("COMMIT");
    parentPort.postMessage({ released: true });
  } else {
    const result = createClyDevSessionRepository({ db }).appendEvent(
      workerData.projectId,
      workerData.sessionId,
      workerData.event,
    );
    parentPort.postMessage({ result });
  }
} catch (error) {
  parentPort.postMessage({
    error: error instanceof Error ? error.message : String(error),
  });
} finally {
  db.close();
}
