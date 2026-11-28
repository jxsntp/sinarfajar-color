import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomBytes, createHash } from "node:crypto";
import { researchDeviceId } from "../support/color-station";

const db = new PrismaClient();
test.afterAll(() => db.$disconnect());

test("research capture loads a same-origin model and falls back locally on faceless video", async ({ page }) => {
  const store = await db.store.findFirstOrThrow({ where: { organization: { slug: "sinar-fajar" }, code: "PURI" } });
  const key = "device_" + randomBytes(32).toString("base64url");
  const keyHash = createHash("sha256").update(key).digest("hex");
  await db.device.upsert({
    where: { id: researchDeviceId },
    create: {
      id: researchDeviceId, organizationId: store.organizationId, storeId: store.id, keyHash, label: "Fixture research kiosk",
    },
    update: { keyHash, revokedAt: null, expiresAt: new Date(Date.now() + 86400000) },
  });
  const enrollment = await page.request.post("/api/kiosk/enroll", { headers: { Authorization: "Bearer " + key } });
  expect(enrollment.ok()).toBe(true);
  await page.addInitScript(() => {
    const fixture = window as Window & { fixtureTrack?: MediaStreamTrack };
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 480;
      canvas.height = 360;
      const context = canvas.getContext("2d")!;
      const stream = canvas.captureStream(12);
      fixture.fixtureTrack = stream.getVideoTracks()[0];
      const paint = () => {
        if (fixture.fixtureTrack?.readyState !== "live") return;
        context.fillStyle = "#848484";
        context.fillRect(0, 0, canvas.width, canvas.height);
        requestAnimationFrame(paint);
      };
      paint();
      return stream;
    };
  });
  await page.goto("/kiosk");
  const session = page.waitForResponse((response) => response.url().endsWith("/api/kiosk/sessions"));
  await page.getByRole("button", { name: "Mulai sesi" }).click();
  expect((await (await session).json()).data.station.mode).toBe("research");
  await page.getByRole("button", { name: "Izinkan kamera" }).click();
  const model = page.waitForResponse((response) => response.url().endsWith("/vision/face_landmarker-v1.task"));
  await page.getByRole("button", { name: "Periksa pencahayaan" }).click();
  expect((await model).ok()).toBe(true);
  await expect(page.getByText("Wajah belum terdeteksi. Posisikan wajah di tengah atau lanjutkan secara manual.")).toBeVisible();
  // The manual comparison takes over, starting with the gold-against-silver step.
  await expect(page.getByRole("button", { name: /Emas kuning/ })).toBeVisible();
  await expect.poll(() => page.evaluate(() =>
    (window as Window & { fixtureTrack?: MediaStreamTrack }).fixtureTrack?.readyState)).toBe("ended");
});
