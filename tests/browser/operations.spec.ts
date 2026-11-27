import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import QRCode from "qrcode";
import { identity } from "../support/identity";

const db = new PrismaClient();
test.afterAll(() => db.$disconnect());
async function scannerFixture(page: Page, image: string) {
  await page.evaluate((source) => {
    navigator.mediaDevices.getUserMedia = async () => {
      const frame = document.createElement("canvas");
      frame.width = 420;
      frame.height = 420;
      const context = frame.getContext("2d")!;
      const label = new Image();
      label.src = source;
      await label.decode();
      function draw() {
        context.fillStyle = "#fff";
        context.fillRect(0, 0, 420, 420);
        context.drawImage(label, 40, 40, 340, 340);
      }
      draw();
      const stream = frame.captureStream(8);
      const track = stream.getVideoTracks()[0];
      const clock = setInterval(draw, 120);
      const stop = track.stop.bind(track);
      track.stop = () => {
        clearInterval(clock);
        stop();
      };
      return stream;
    };
  }, image);
}

test("fills a mobile try-on, decodes product and cashier QR and reconciles the linked receipt", async ({
  page,
  browser,
  request,
}) => {
  const slug = "retail-" + randomUUID();
  const org = await db.organization.create({
    data: { name: "Retail browser test", slug },
  });
  const { id: storeId } = await db.store.create({
    data: { organizationId: org.id, code: "TEST", name: "Retail test store" },
  });
  const key = "device_" + randomBytes(32).toString("base64url");
  await db.device.create({
    data: {
      organizationId: org.id,
      storeId,
      label: "Browser kiosk",
      keyHash: createHash("sha256").update(key).digest("hex"),
    },
  });
  const brand = await db.brand.create({
    data: { organizationId: org.id, name: "Test jeweler" },
  });
  const product = await db.product.create({
    data: {
      organizationId: org.id,
      brandId: brand.id,
      name: "Pearl Necklace",
      sku: "TEST-NECKLACE",
      category: "necklace",
      goldColor: "yellow",
      purity: "18K",
    },
  });
  await db.inventory.create({
    data: {
      organizationId: org.id,
      storeId,
      productId: product.id,
      onHand: 2,
      price: "250000.00",
      displayLocation: "Cabinet 3",
    },
  });
  const operator = await identity(db, org.id);
  await page.goto("/login");
  await page.getByLabel("Organization", { exact: true }).fill(slug);
  await page.getByLabel("Email").fill(operator.email);
  await page.getByLabel("Password").fill(operator.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", { name: "Store requests" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 430, height: 932 });
  const start = await request.post("/api/kiosk/sessions", {
    headers: { Authorization: "Bearer " + key },
  });
  expect(start.ok()).toBeTruthy();
  const { sessionId, credential } = (await start.json()).data;
  const issued = await request.post("/api/kiosk/report", {
    headers: { Authorization: "Bearer " + credential },
    data: { profile: "warm", palette: ["#D4A475"] },
  });
  expect(issued.ok()).toBeTruthy();
  const { reportPath, reportUrl } = (await issued.json()).data;

  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const mobile = await phone.newPage();
  await mobile.goto(reportUrl);
  await mobile.getByRole("link", { name: "Jelajahi perhiasan" }).click();
  await mobile.getByRole("button", { name: "Temukan perhiasan saya" }).click();
  await mobile.getByRole("link", { name: "Pearl Necklace" }).click();
  await mobile.getByLabel("Tanyakan produk ini").selectOption("tryon");
  await mobile.getByRole("button", { name: "Kirim permintaan" }).click();
  await expect(mobile.getByText("Permintaan tersimpan.")).toBeVisible();
  await page.bringToFront();
  const card = page.locator("article").filter({ hasText: sessionId });
  await expect(card.getByText("Cabinet 3", { exact: false })).toBeVisible({ timeout: 15000 });
  await card.getByRole("button", { name: "Acknowledge" }).click();
  await card.getByRole("button", { name: "Start preparing" }).click();
  await card.getByRole("button", { name: "Mark ready" }).click();
  await scannerFixture(
    page,
    await QRCode.toDataURL("sinar-fajar:sku:TEST-NECKLACE"),
  );
  await card.getByRole("button", { name: "Scan barcode or QR" }).click();
  await expect(card.getByLabel("Product label")).toHaveValue(
    "sinar-fajar:sku:TEST-NECKLACE",
    { timeout: 12000 },
  );
  await card.getByRole("button", { name: "Confirm physical try-on" }).click();
  await expect(card.getByText("Completed", { exact: true })).toBeVisible();

  await mobile.goto(reportUrl);
  await mobile
    .getByText("Konfirmasi coba perhiasan di toko", { exact: true })
    .click();
  await mobile
    .getByRole("button", { name: "Periksa catatan coba perhiasan" })
    .click();
  await mobile
    .getByRole("button", { name: "Saya mencoba perhiasan ini" })
    .click();
  await expect(mobile.getByText("Dikonfirmasi", { exact: true })).toBeVisible();
  await mobile.locator("summary").filter({ hasText: "Buat kode kasir" }).click();
  await mobile
    .getByRole("button", { name: "Buat kode kasir", exact: true })
    .click();
  const qr = mobile.getByRole("img", { name: "QR atribusi kasir" });
  await expect(qr).toBeVisible();
  const source = await qr.getAttribute("src");
  if (!source) throw new Error("Missing cashier QR");

  const reference = "BROWSER-RECEIPT";
  const receipt = await page.request.post("/api/operations/pos", {
    data: {
      storeId,
      command: {
        type: "sale",
        externalRef: reference,
        soldAt: new Date().toISOString(),
        currency: "IDR",
        total: "250000.00",
        lines: [{ sku: "TEST-NECKLACE", quantity: 1, unitPrice: "250000.00" }],
      },
    },
  });
  expect(receipt.ok()).toBeTruthy();
  await page.bringToFront();
  await page.getByText("Link a cashier code", { exact: true }).click();
  await page.getByLabel("Verified transaction reference").fill(reference);
  await scannerFixture(page, source);
  await page.getByRole("button", { name: "Scan cashier QR" }).click();
  const cashierCode = page.getByRole("textbox", {
    name: "Cashier code",
    exact: true,
  });
  await expect(cashierCode).toHaveValue(/^checkout_/, { timeout: 12000 });
  expect(await cashierCode.inputValue()).not.toContain(
    reportPath.split("/").pop(),
  );
  await page.getByRole("button", { name: "Link transaction" }).click();
  await expect(
    page.getByText("Transaction linked.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Sales reconciliation and metrics" })
    .click();
  const row = page.getByRole("row").filter({ hasText: reference });
  await expect(row.getByText("rules assisted")).toBeVisible();
  await expect(row.getByText("TEST-NECKLACE ×1 · recommended")).toBeVisible();
  await phone.close();
});
