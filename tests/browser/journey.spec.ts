import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { identity } from "../support/identity";
const db = new PrismaClient();
test.afterAll(() => db.$disconnect());

test("registered kiosk hands off a private mobile report and staff can retrieve its channel history", async ({
  page,
  browser,
  request,
}) => {
  const org = await db.organization.findUniqueOrThrow({
    where: { slug: "sinar-fajar" },
  });
  const operator = await identity(db, org.id);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email").fill(operator.email);
  await page.getByLabel("Password").fill(operator.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", { name: "Store operations" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Dashboard" }).click();
  await expect(page.getByText("In-stock product lines")).toBeVisible();
  await page.getByRole("link", { name: "AI laboratory" }).click();
  await expect(page.getByText("Registered experiments")).toBeVisible();
  await page.getByRole("link", { name: "Administration", exact: true }).click();
  await page.getByLabel("Device name").fill("Browser test kiosk");
  await page.getByRole("button", { name: "Register device" }).click();
  const credential = await page.getByRole("status").innerText();

  const kiosk = await browser.newContext();
  const screen = await kiosk.newPage();
  await screen.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("Denied", "NotAllowedError");
    };
  });
  await screen.goto("http://127.0.0.1:3308/kiosk");
  await screen.getByRole("button", { name: "Mulai sesi" }).click();
  await screen.getByLabel("Kode perangkat").fill(credential);
  const enrollment = screen.waitForResponse((r) =>
    r.url().endsWith("/api/kiosk/enroll"),
  );
  await screen.getByRole("button", { name: "Hubungkan perangkat" }).click();
  expect((await enrollment).status()).toBe(200);
  const start = screen.waitForResponse((r) =>
    r.url().endsWith("/api/kiosk/sessions"),
  );
  await screen.getByRole("button", { name: "Mulai sesi" }).click();
  const session = (await (await start).json()).data;
  await screen.getByRole("button", { name: "Bandingkan tanpa kamera" }).click();
  await expect(screen.getByRole("button", { name: "Simpan palet" })).toHaveCount(0);
  for (const name of [/Biru kobalt/, /Hijau pinus/, /Merah anggur/, /Ungu anggrek/, "Keduanya", "Keduanya"]) {
    await screen.getByRole("button", { name }).click();
  }
  await expect(screen.getByRole("heading", { name: /Dua kelompok warna/ })).toBeVisible();
  await expect(screen.getByText("Putih lembut")).toBeVisible();
  await expect(
    screen.getByRole("heading", { name: "Palet pribadi Anda" }),
  ).toBeVisible();
  expect(
    await db.recommendationRun.count({
      where: { sessionId: session.sessionId },
    }),
  ).toBe(0);
  await screen.getByRole("button", { name: "Akhiri sesi" }).click();
  const newSession = screen.waitForResponse((r) =>
    r.url().endsWith("/api/kiosk/sessions"),
  );
  await screen.getByRole("button", { name: "Mulai sesi" }).click();
  Object.assign(session, (await (await newSession).json()).data);
  await screen.getByRole("button", { name: "Izinkan kamera" }).click();
  await expect(
    screen.getByText(
      "Kamera tidak tersedia. Anda tetap bisa membandingkan palet.",
    ),
  ).toBeVisible();
  await screen.getByRole("button", { name: "Belum yakin" }).click();
  await screen.getByRole("button", { name: "Simpan palet" }).click();
  await expect(
    screen.getByRole("heading", { name: "Palet pribadi Anda" }),
  ).toBeVisible();
  await expect(
    screen.getByRole("img", { name: "Pindai untuk membuka laporan" }),
  ).toHaveCount(0);
  const handoff = screen.waitForResponse((r) =>
    r.url().endsWith("/api/kiosk/report"),
  );
  await screen
    .getByRole("button", { name: "Buat laporan untuk ponsel" })
    .click();
  const { reportPath, reportUrl } = (await (await handoff).json()).data;
  expect(reportUrl).toBe("http://127.0.0.1:3308" + reportPath);
  await expect(
    screen.getByRole("img", { name: "Pindai untuk membuka laporan" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      db.interactionEvent.count({
        where: { sessionId: session.sessionId, name: "qr_displayed" },
      }),
    )
    .toBe(1);
  await screen.getByRole("button", { name: "Akhiri sesi" }).click();
  await expect(
    screen.getByRole("heading", { name: "Studio Warna" }),
  ).toBeVisible();
  expect(
    (
      await request.get(reportPath, {
        headers: { "User-Agent": "link-preview", Purpose: "prefetch" },
      })
    ).ok(),
  ).toBeTruthy();
  expect(
    await db.interactionEvent.count({
      where: { sessionId: session.sessionId, channel: "MOBILE" },
    }),
  ).toBe(0);
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  const mobile = await phone.newPage();
  await mobile.bringToFront();
  const response = await mobile.goto(reportUrl);
  expect(response?.headers()["cache-control"]).toContain("no-store");
  expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
  await expect(
    mobile.getByRole("heading", { name: "Palet pribadi Anda" }),
  ).toBeVisible();
  await expect(
    mobile.getByRole("heading", { name: "Belum yakin", exact: true }),
  ).toBeVisible();
  await expect(mobile.getByText("Putih lembut")).toBeVisible();
  await expect
    .poll(() =>
      db.interactionEvent.count({
        where: { sessionId: session.sessionId, channel: "MOBILE" },
      }),
    )
    .toBe(1);
  expect((await request.get(reportPath + "/discover")).ok()).toBeTruthy();
  expect((await request.get(reportPath + "/product/DEMO-A01")).status()).toBe(
    404,
  );
  expect((await request.get("/api/mobile/recommendations")).status()).toBe(405);
  expect(
    (
      await request.post("/api/mobile/recommendations", {
        headers: { Authorization: "Bearer " + session.credential },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.post("/api/mobile/recommendations", {
        headers: { Authorization: "Bearer " + reportPath.split("/").pop() },
      })
    ).status(),
  ).toBe(400);
  expect(
    await db.recommendationRun.count({
      where: { sessionId: session.sessionId },
    }),
  ).toBe(0);
  const download = mobile.waitForEvent("download");
  await mobile.getByRole("button", { name: "Unduh kartu palet" }).click();
  expect((await download).suggestedFilename()).toBe("sinar-fajar-palette.png");
  await expect.poll(() => db.interactionEvent.count({ where: { sessionId: session.sessionId, name: "results_saved" } })).toBe(1);
  await mobile.getByText("Preferensi pemasaran", { exact: true }).click();
  await mobile.getByRole("button", { name: "Izinkan pemasaran" }).click();
  await expect(mobile.getByText("Pilihan tersimpan.")).toBeVisible();
  expect(await db.consent.count({ where: { sessionId: session.sessionId, purpose: "marketing", granted: true } })).toBe(1);
  await mobile.getByRole("link", { name: "Jelajahi perhiasan" }).press("Enter");
  await mobile.getByLabel("Kategori", { exact: true }).fill("necklace");
  await mobile.getByRole("button", { name: "Temukan perhiasan saya" }).click();
  await expect(
    mobile.getByRole("heading", { name: "Pilihan Anda" }),
  ).toBeVisible();
  await phone.setOffline(true);
  await expect(mobile.getByText("Harga dan stok belum dapat diverifikasi.", { exact: false })).toBeVisible();
  await expect(mobile.getByRole("link", { name: "Aurora Pendant" })).toHaveCount(0);
  await phone.setOffline(false);
  await mobile.getByRole("link", { name: "Aurora Pendant" }).click();
  await expect(
    mobile.getByRole("heading", { name: "Aurora Pendant" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      db.interactionEvent.count({
        where: { sessionId: session.sessionId, name: "product_detail_viewed" },
      }),
    )
    .toBe(1);
  await phone.setOffline(true);
  await expect(mobile.getByRole("heading", { name: "Aurora Pendant" })).toHaveCount(0);
  await phone.setOffline(false);
  await expect(mobile.getByRole("heading", { name: "Aurora Pendant" })).toBeVisible();
  await mobile.getByLabel("Tanyakan produk ini").selectOption("later");
  await mobile
    .getByLabel("Email untuk tindak lanjut")
    .fill("customer@example.test");
  await mobile.getByRole("button", { name: "Kirim permintaan" }).click();
  await expect(mobile.getByText("Permintaan tersimpan.")).toBeVisible();
  expect(
    await db.productInquiry.count({
      where: { sessionId: session.sessionId, status: "contact_later" },
    }),
  ).toBe(1);
  const log = {
    sessionId: session.sessionId,
    event: {
      id: randomUUID(),
      name: "staff_session_reviewed",
      occurredAt: new Date().toISOString(),
    },
  };
  expect(
    (await page.request.post("/api/events", { data: log })).ok(),
  ).toBeTruthy();
  const history = await page.request.get(
    "/api/events?sessionId=" + session.sessionId,
  );
  const events: { channel: string }[] = (await history.json()).data;
  expect(new Set(events.map((e) => e.channel))).toEqual(
    new Set(["KIOSK", "MOBILE", "STAFF"]),
  );
  expect(
    (
      await page.request.post("/api/reports/revoke", {
        data: { sessionId: session.sessionId },
      })
    ).ok(),
  ).toBeTruthy();
  expect((await request.get(reportPath)).status()).toBe(404);
  await db.membership.update({
    where: {
      userId_organizationId: {
        userId: operator.userId,
        organizationId: org.id,
      },
    },
    data: { role: "MARKETING_ANALYST" },
  });
  expect((await page.request.post("/api/devices", { data: {} })).status()).toBe(
    403,
  );
  await page.goto("/dashboard");
  await expect(page.getByRole("link", { name: "Administration" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await kiosk.close();
  await phone.close();
});
