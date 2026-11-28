import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { chartGuide, colorCheckerClassic, d50, d65 } from "@/domains/color-analysis/chart";
import { adaptXyz, labToXyz } from "@/domains/color-analysis/measurement";
import { identity } from "../support/identity";

const db = new PrismaClient();
test.afterAll(() => db.$disconnect());

// What an ideal sRGB camera at 85% exposure records for each chart patch.
const inverse = [3.2404542, -1.5371385, -0.4985314, -0.969266, 1.8760108, 0.041556, 0.0556434, -0.2040259, 1.0572252];
const encode = (v: number) => Math.round(255 * Math.min(1, Math.max(0, v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)));
const patches = colorCheckerClassic.patches.map(({ lab }) => {
  const xyz = adaptXyz(labToXyz(lab, d50), d50, d65);
  return [0, 3, 6].map((i) => encode(0.85 * (inverse[i] * xyz[0] + inverse[i + 1] * xyz[1] + inverse[i + 2] * xyz[2])));
});

test("an administrator measures a chart and receives a station entry", async ({ page }) => {
  const org = await db.organization.findUniqueOrThrow({ where: { slug: "sinar-fajar" } });
  const operator = await identity(db, org.id);
  await page.addInitScript(({ colors, guide }) => {
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 480;
      const context = canvas.getContext("2d")!;
      const [gx, gy, gw, gh] = guide;
      const paint = () => {
        context.fillStyle = "#282828";
        context.fillRect(0, 0, 640, 480);
        colors.forEach(([r, g, b], i) => {
          context.fillStyle = `rgb(${r},${g},${b})`;
          const w = (gw * 640) / 6, h = (gh * 480) / 4;
          context.fillRect(gx * 640 + (i % 6) * w, gy * 480 + Math.floor(i / 6) * h, Math.ceil(w), Math.ceil(h));
        });
        requestAnimationFrame(paint);
      };
      paint();
      return canvas.captureStream(15);
    };
  }, { colors: patches, guide: [...chartGuide] });
  await page.goto("/admin/calibration");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email").fill(operator.email);
  await page.getByLabel("Password").fill(operator.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Store operations" })).toBeVisible();
  await page.goto("/admin/calibration");
  await page.getByRole("button", { name: "Start camera" }).click();
  await expect(page.locator("video")).toBeVisible();
  await expect.poll(() => page.locator("video").evaluate((video: HTMLVideoElement) => video.videoWidth)).toBe(640);
  await page.getByRole("button", { name: "Measure chart" }).click();
  await expect(page.getByRole("heading", { name: "Within the provisional targets" })).toBeVisible();
  await page.getByLabel("Kiosk device ID").fill("e9ab914a-6da6-4ddf-96b5-7053993f36a7");
  const entry = JSON.parse(await page.locator(".calibration-json").innerText());
  expect(entry["e9ab914a-6da6-4ddf-96b5-7053993f36a7"]).toMatchObject({
    mode: "manual", calibration: { revision: expect.stringMatching(/^station-\d{8}-\d{4}$/), white: [0.95047, 1, 1.08883] },
  });
  expect(entry["e9ab914a-6da6-4ddf-96b5-7053993f36a7"].calibration.matrix).toHaveLength(12);
});
