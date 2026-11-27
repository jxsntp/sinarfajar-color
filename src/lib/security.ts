import { createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { db } from "./db";
import { env } from "./env";
import { HttpError } from "./http";

export function clientBucket(headers: Headers) {
  if (process.env.VERCEL !== "1") return "shared";
  const address = headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  return address && isIP(address) ? address : "shared";
}
function bucketHash(value: string) {
  const config = env();
  return createHmac("sha256", config.SECURITY_KEY ?? "local-only-inaura-rate-key").update(value).digest("hex");
}
export async function consumeQuota(label: string, subject: string, limit: number, seconds: number, at = Date.now()) {
  const key = bucketHash(label + "\0" + subject);
  const windowMs = seconds * 1000;
  const window = new Date(Math.floor(at / windowMs) * windowMs);
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateBucket" (key, "window", count) VALUES (${key}, ${window}, 1)
    ON CONFLICT (key, "window") DO UPDATE SET count = "RateBucket".count + 1
    WHERE "RateBucket".count < ${limit} RETURNING count`;
  if (!rows.length) throw new HttpError(429, "rate_limited", Math.ceil((window.getTime() + windowMs - at) / 1000));
}
export async function networkQuota(req: Request, label: string, perMinute: number) {
  await consumeQuota(label + ":network", clientBucket(req.headers), perMinute, 60);
}
export async function boundedJson(req: Request, maxBytes = 8192): Promise<unknown> {
  const declared = req.headers.get("content-length");
  if (declared && Number(declared) > maxBytes) throw new HttpError(413, "body_too_large");
  if (!req.body) throw new HttpError(400, "invalid_request");
  const reader = req.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        void reader.cancel().catch(() => {});
        throw new HttpError(413, "body_too_large");
      }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally { reader.releaseLock(); }
}
export function secureEqual(left: string, right: string) {
  const key = "inaura-compare-v1";
  return timingSafeEqual(createHmac("sha256", key).update(left).digest(), createHmac("sha256", key).update(right).digest());
}
export function signature(secret: string, timestamp: string, nonce: string, body: string) {
  return createHmac("sha256", secret).update(timestamp + "." + nonce + "." + body).digest("hex");
}
export async function verifySignedJob(req: Request, secret: string | undefined, now = Date.now()) {
  const timestamp = req.headers.get("x-inaura-timestamp") ?? "";
  const nonce = req.headers.get("x-inaura-nonce") ?? "";
  const received = req.headers.get("x-inaura-signature") ?? "";
  if (!secret || !/^\d{10}$/.test(timestamp) || Math.abs(now - Number(timestamp) * 1000) > 300000 ||
    !/^[A-Za-z0-9_-]{16,80}$/.test(nonce) || !/^[a-f0-9]{64}$/.test(received)) throw new HttpError(401, "invalid_job_signature");
  const reader = req.body?.getReader();
  const decoder = new TextDecoder("utf-8", {fatal:true});
  let size = 0;
  let body = "";
  try {
    if (reader) for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 8192) { void reader.cancel().catch(() => {}); throw new HttpError(413, "body_too_large"); }
      body += decoder.decode(chunk.value,{stream:true});
    }
    body += decoder.decode();
  } finally { reader?.releaseLock(); }
  if (!secureEqual(signature(secret,timestamp,nonce,body), received)) throw new HttpError(401, "invalid_job_signature");
  const parsed: unknown = JSON.parse(body);
  const recorded = await db.webhookNonce.createMany({ data:{key:bucketHash("job:"+nonce),expiresAt:new Date(now+601000)},skipDuplicates:true });
  if (!recorded.count) throw new HttpError(409, "job_replay");
  return parsed;
}
