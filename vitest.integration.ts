import { defineConfig, mergeConfig } from "vitest/config";
import unit from "./vitest.config";
export default mergeConfig(
  unit,
  defineConfig({
    test: {
      include: ["tests/integration/**/*.test.ts"],
      exclude: ["tests/unit/**"],
      setupFiles: ["./tests/support/local-env.ts"],
      testTimeout: 30000,
      hookTimeout: 60000,
    },
  }),
);
