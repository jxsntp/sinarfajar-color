import { readFileSync } from "node:fs";
import { parseArgs, parseEnv } from "node:util";
import { ZodError } from "zod";
import { isVercelHostedTarget, parseEnvironment } from "../src/lib/env";

function check() {
  const { values } = parseArgs({
    options: { file: { type: "string" }, target: { type: "string" }, "vercel-only": { type: "boolean" } },
  });
  if (values["vercel-only"] && !isVercelHostedTarget(process.env)) return;
  if (values.target && values.target !== "production" && values.target !== "preview") {
    throw new Error("Invalid target.");
  }

  const input = values.file ? parseEnv(readFileSync(values.file, "utf8")) : { ...process.env };
  if (values.target) input.VERCEL_ENV = values.target;
  parseEnvironment(input);
  console.log("Environment configuration passed.");
}

try {
  check();
} catch (error) {
  if (error instanceof ZodError) {
    console.error("Environment configuration failed. Set these variables before building:");
    for (const issue of error.issues) {
      console.error("- " + issue.path.join(".") + " — " + issue.message);
    }
  } else {
    console.error("Could not check the environment. Use --file with an existing env file and --target production or preview.");
  }
  process.exitCode = 1;
}
