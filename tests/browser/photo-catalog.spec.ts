import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { identity } from "../support/identity";
import { issue, digest } from "@/lib/credentials";
import { startSession, issueReport } from "@/domains/sessions/service";
import { cameraNotice } from "@/domains/color-analysis/stations";
import { paletteVersion } from "@/domains/color-analysis/swatches";
import { rankTrial } from "@/domains/color-analysis/trial-ranking";

const db = new PrismaClient();
test.afterAll(() => db.$disconnect());

test("publishes catalog photos and shows one visual pick per jewelry category after mobile registration", async ({ page, browser, baseURL }) => {
  if (!baseURL) throw Error("This test requires a local app URL");
  const host = new URL(baseURL).host;
  const org = await db.organization.create({ data: { slug: "photo-browser-" + randomUUID(), name: "Photo fixture" } });
  const store = await db.store.create({ data: { organizationId: org.id, code: "TST", name: "Photo store" } });
  const admin = await identity(db, org.id);
  await page.goto("/login");
  await page.getByLabel("Organization", { exact: true }).fill(org.slug);
  await page.getByLabel("Email").fill(admin.email);
  await page.getByLabel("Password").fill(admin.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("link", { name: "Administration", exact: true }).click();
  await page.getByRole("link", { name: "Manage product catalog" }).click();
  await page.getByRole("link", { name: "Manage photo catalog" }).click();
  await expect(page.getByRole("heading", { name: "Photo catalog", exact: true })).toBeVisible();
  const categories = ["earring", "necklace", "ring", "bracelet"];
  const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aKXkAAAAASUVORK5CYII=", "base64");
  await page.getByLabel("Catalog photos", { exact: true }).setInputFiles([...categories, "draft-ring"].map((name) => ({
    name: name + ".png", mimeType: "image/png", buffer: bytes,
  })));
  await page.getByRole("button", { name: "Upload catalog photos" }).click();
  await expect(page.getByText("Photos are ready for review.")).toBeVisible();
  for (const category of categories) {
    const row = page.getByRole("article").filter({ has: page.getByRole("heading", { name: category, exact: true }) });
    await row.getByLabel("Jewelry category").selectOption(category);
    await row.getByLabel("Apparent metal color").selectOption("yellow");
    await row.getByRole("button", { name: "Publish photo", exact: true }).click();
    await expect(row.getByRole("button", { name: "Update visual tags", exact: true })).toBeVisible();
  }

  const key = issue("device");
  await db.device.create({
    data: { organizationId: org.id, storeId: store.id, label: "Photo fixture kiosk", keyHash: digest(key, "device") },
  });
  const session = await startSession(key, host);
  const consent = await db.consent.create({
    data: { organizationId: org.id, sessionId: session.sessionId, granted: true, purpose: "local_camera", version: cameraNotice },
  });
  const station = session.trialStation!;
  const result = rankTrial([56, 18, 26], station.calibration!, paletteVersion, { tones: ["pale", "dull"], quality: "stable" })!;
  const token = issue("report");
  const report = await issueReport(session.credential, { result, reportCredential: token, cameraConsentId: consent.id }, host);
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await phone.goto(baseURL + report.reportPath + "/discover");
    await expect(phone.getByRole("img", { name: "earring", exact: true })).toHaveCount(0);
    const sample = await db.photoCatalogItem.findFirstOrThrow({ where: { organizationId: org.id, category: "earring", state: "PUBLISHED" } });
    const mediaPath = report.reportPath + "/photos/" + sample.id;
    expect((await phone.request.get(baseURL + mediaPath)).status()).toBe(404);
    const form = phone.locator("form").filter({ has: phone.getByRole("button", { name: "Daftar dan lihat perhiasan" }) });
    await form.locator('input[name="name"]').fill("Demo Customer");
    await form.locator('input[name="email"]').fill("customer@example.test");
    await form.locator('input[name="phone"]').fill("+62 811 555 0123");
    await form.getByRole("button", { name: "Daftar dan lihat perhiasan" }).click();
    await expect(phone.getByText("Tanyakan harga, spesifikasi, dan ketersediaan kepada toko.", { exact: false })).toBeVisible();
    for (const category of categories) {
      const photo = phone.getByRole("img", { name: category, exact: true });
      await expect(photo).toBeVisible();
      await expect.poll(() => photo.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
    }
    await expect(phone.getByRole("img", { name: "draft-ring", exact: true })).toHaveCount(0);
    await expect(phone.getByRole("img", { name: "earring", exact: true })).toHaveAttribute("src", mediaPath);
    expect(await (await phone.request.get(baseURL + mediaPath)).body()).toEqual(bytes);
    await phone.getByRole("heading", { name: "Pilihan Anda", exact: true }).scrollIntoViewIfNeeded();
    await expect.poll(() => db.interactionEvent.count({
      where: { sessionId: session.sessionId, name: "photo_recommendation_impression" },
    })).toBe(1);
  } finally {
    await phone.close();
  }
});
