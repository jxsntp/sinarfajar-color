import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";

const db = new PrismaClient();
test.afterAll(() => db.$disconnect());

test("a failed handoff leaves the local result, retries safely and resets an unscanned kiosk", async ({
  page,
  context,
}) => {
  const store = await db.store.findFirstOrThrow({
    where: { code: "PURI", organization: { slug: "sinar-fajar" } },
  });
  const key = "device_" + randomBytes(32).toString("base64url");
  await db.device.create({
    data: {
      organizationId: store.organizationId,
      storeId: store.id,
      label: "Resilience fixture",
      keyHash: createHash("sha256").update(key).digest("hex"),
    },
  });
  await context.addCookies([
    { name: "inaura_device", value: key, url: "http://127.0.0.1:3308" },
  ]);
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const target = document.createElement("canvas");
      target.width = 640;
      target.height = 480;
      const context = target.getContext("2d")!;
      context.fillStyle = "#808080";
      context.fillRect(0, 0, 640, 480);
      const stream = target.captureStream(2);
      const track = stream.getVideoTracks()[0];
      const stop = track.stop.bind(track);
      track.stop = () => {
        document.documentElement.setAttribute("data-camera-stopped", "true");
        stop();
      };
      return stream;
    };
  });
  await page.clock.install();
  await page.goto("/kiosk");
  await expect(page.getByRole("link", { name: "Masuk staf" })).toHaveCount(0);
  await expect(page.getByText("Hubungkan perangkat")).toHaveCount(0);
  const started = page.waitForResponse((response) =>
    response.url().endsWith("/api/kiosk/sessions"),
  );
  await page.getByRole("button", { name: "Mulai sesi" }).click();
  const session = (await (await started).json()).data;
  await page.getByRole("button", { name: "Izinkan kamera" }).click();
  await expect(page.locator("video")).toBeVisible();
  await expect
    .poll(() =>
      page.locator("video").evaluate((el: HTMLVideoElement) => el.videoWidth),
    )
    .toBe(640);
  await page.getByRole("button", { name: "Periksa pencahayaan" }).click();
  await expect(page.getByText("Cahaya cukup")).toBeVisible();
  await expect(page.getByRole("button", { name: "Semua gaya" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Feminin" }).click();
  // With the preview on, the customer can see the effect, so the analyst's question is asked.
  await expect(page.getByText("Mana yang membuat kulit tampak lebih rata dan bayangan di bawah mata lebih lembut?")).toBeVisible();
  // Metal, then light against deep, clear against soft, and the two leaders against each other.
  for (const name of [/Emas kuning/, /Hijau mint/, /Merah muda kerang/, /Biru kobalt/, /Ungu anggrek/, /Kuning marigold/, /Merah karmin/]) {
    await page.getByRole("button", { name }).click();
  }
  await expect(page.getByRole("heading", { name: /Palet pilihan Anda · Cerah · Feminin/ })).toBeVisible();
  await expect(page.getByText("Merah muda fuchsia")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pilihan Anda", exact: true })).toBeVisible();
  await expect(page.locator(".labeled-swatches.featured")).toContainText("Ungu anggrek");
  await expect(page.getByText("Biru kobalt")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Warna emas untuk dicoba" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute(
    "data-camera-stopped",
    "true",
  );
  await expect(page.locator("video")).toHaveCount(0);
  await page.route(
    "**/api/kiosk/report",
    async (route) => {
      const response = await route.fetch();
      expect(response.ok()).toBeTruthy();
      await route.abort();
    },
    { times: 1 },
  );
  await page.getByRole("button", { name: "Buat laporan untuk ponsel" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Palet pribadi Anda" }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Pindai untuk membuka laporan" }),
  ).toHaveCount(0);
  const testLink = page.getByRole("link", { name: "Buka laporan (uji coba)" });
  await expect(testLink).toHaveCount(0);
  let blocked = false;
  await page.route("**/api/kiosk/events", async (route) => {
    if (
      !blocked &&
      route.request().postDataJSON()?.event?.name === "qr_displayed"
    ) {
      blocked = true;
      await route.abort();
    } else await route.continue();
  });
  const savedReport = page.waitForResponse((response) =>
    new URL(response.url()).pathname === "/api/kiosk/report" && response.ok());
  await page.getByRole("button", { name: "Coba lagi" }).click();
  const saved = await savedReport;
  expect(saved.request().postDataJSON()).toMatchObject({ style: "feminine" });
  const { reportUrl } = (await saved.json()).data;
  await expect(testLink).toHaveAttribute("href", reportUrl);
  await expect(
    page.getByRole("img", { name: "Pindai untuk membuka laporan" }),
  ).toBeVisible();
  await expect.poll(() => blocked).toBe(true);
  await page.clock.fastForward(61000);
  await expect(
    page.getByRole("heading", { name: "Studio Warna" }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Pindai untuk membuka laporan" }),
  ).toHaveCount(0);
  await expect(testLink).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect
    .poll(() =>
      db.interactionEvent.count({
        where: { sessionId: session.sessionId, name: "qr_displayed" },
      }),
    )
    .toBe(1);
  expect(
    await db.mobileReportToken.count({
      where: { sessionId: session.sessionId, revokedAt: null },
    }),
  ).toBe(1);
  expect(
    await db.recommendationRun.count({
      where: { sessionId: session.sessionId },
    }),
  ).toBe(0);
  expect(
    await db.interactionEvent.count({
      where: { sessionId: session.sessionId, name: "mobile_report_opened" },
    }),
  ).toBe(0);
});
