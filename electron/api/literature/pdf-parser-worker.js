import { parentPort, workerData } from "node:worker_threads";
import { parsePdfBytes } from "./pdf-parser-core.js";

try {
  parentPort.postMessage({
    ok: true,
    result: parsePdfBytes(workerData.bytes, workerData.limits),
  });
} catch (error) {
  parentPort.postMessage({
    ok: false,
    error: error instanceof Error ? error.message : "PDF parsing failed.",
  });
}
