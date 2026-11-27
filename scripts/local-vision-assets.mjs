import { cpSync, mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const runtime = dirname(require.resolve("@mediapipe/tasks-vision"));
const output = new URL("../public/vision/wasm/", import.meta.url);
const model = new URL("../public/vision/face_landmarker-v1.task", import.meta.url);
const checksum = createHash("sha256").update(readFileSync(model)).digest("hex");
if (checksum !== "64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff") {
  throw new Error("Face Landmarker model checksum does not match version 1.");
}
mkdirSync(output, { recursive: true });
cpSync(join(runtime, "wasm"), output, { recursive: true });
