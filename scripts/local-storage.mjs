import { createHmac, randomBytes } from "node:crypto";
import { appendFileSync, existsSync } from "node:fs";
if (!existsSync(".env")) throw new Error("Copy .env.example to .env first");
process.loadEnvFile(".env");
if (process.env.APP_ENV !== "development" || process.env.SUPABASE_URL !== "http://127.0.0.1:25421") throw new Error("Local Compose configuration required");
const secret = "development-only-test-signature-replace-on-hosted-services";
function token(role) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const body = encode({ alg:"HS256",typ:"JWT" }) + "." + encode({role,iss:"local-compose",exp:4102444800});
  return body + "." + createHmac("sha256",secret).update(body).digest("base64url");
}
for (const [name,role] of [["LOCAL_STORAGE_SERVICE_KEY","service_role"],["LOCAL_STORAGE_ANON_KEY","anon"]]) {
  if (!process.env[name]) appendFileSync(".env","\n" + name + "=" + token(role) + "\n");
}
if (!process.env.LOCAL_DEMO_STAFF_PASSWORD) {
  const password = "Sinar!" + randomBytes(18).toString("base64url");
  appendFileSync(".env", "\nLOCAL_DEMO_STAFF_PASSWORD=" + password + "\n");
}
console.log("Local Storage and demo staff credentials configured in ignored .env.");
