import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { identity } from "../support/identity";

const db = new PrismaClient();
test.afterAll(() => db.$disconnect());
test("managers view scoped KPIs and CSVs and admins create a reviewed comparison", async ({
  page,
}) => {
  const slug = "metrics-" + randomUUID();
  const org = await db.organization.create({
    data: { slug, name: "Analytics browser fixture" },
  });
  const store = await db.store.create({
    data: { organizationId: org.id, name: "Metrics store", code: "QA" },
  });
  const staff = await identity(db, org.id);
  const brand = await db.brand.create({
    data: { organizationId: org.id, name: "Jeweler" },
  });
  const product = await db.product.create({
    data: {
      organizationId: org.id,
      brandId: brand.id,
      sku: "METRIC-RING",
      name: "Reviewed ring",
      category: "ring",
      goldColor: "yellow",
      purity: "18K",
    },
  });
  await db.inventory.create({
    data: {
      organizationId: org.id,
      storeId: store.id,
      productId: product.id,
      price: "350000.00",
      onHand: 2,
    },
  });
  await page.goto("/login");
  await page.getByLabel("Organization", { exact: true }).fill(slug);
  await page.getByLabel("Email").fill(staff.email);
  await page.getByLabel("Password").fill(staff.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Customer funnel and marketing" }),
  ).toBeVisible();
  await expect(
    page.getByText("Daily kiosk starts and unique mobile opens"),
  ).toBeVisible();
  const qr = page
    .getByRole("row")
    .filter({
      has: page.getByRole("rowheader", { name: "QR handoff", exact: true }),
    });
  await expect(qr).toContainText("Unavailable");
  const link = page.getByRole("link", { name: "Export kpis CSV" });
  const exportUrl = await link.getAttribute("href");
  if (!exportUrl) throw new Error("Missing export URL");
  const response = await page.request.get(exportUrl);
  expect(response.headers()["content-type"]).toContain("text/csv");
  expect(await response.text()).toContain('"QR handoff"');
  await page
    .getByRole("link", { name: "Approved data and financial evaluation" })
    .click();
  await expect(
    page.getByText("No approved financial input is available."),
  ).toBeVisible();
  await page.getByRole("link", { name: "AI laboratory", exact: true }).click();
  await page
    .locator("summary")
    .filter({ hasText: "Save human-reviewed test case" })
    .click();
  await page.getByLabel("Case name").fill("Ring evaluator");
  await page.getByLabel("Reviewed relevant SKUs").fill("METRIC-RING");
  await page.getByRole("button", { name: "Save reviewed case" }).click();
  await page
    .locator("summary")
    .filter({ hasText: "Compare rules and model variants" })
    .click();
  await expect(page.getByLabel("Reviewed case")).toContainText(
    "Ring evaluator",
  );
  await page.getByRole("button", { name: "Run comparison" }).click();
  const history = page.getByRole("row").filter({ hasText: "Ring evaluator" });
  await expect(history).toContainText("100.0%");
  await db.membership.update({
    where: {
      userId_organizationId: { userId: staff.userId, organizationId: org.id },
    },
    data: { role: "MARKETING_ANALYST" },
  });
  const denied = await page.request.get("/api/admin/evaluation");
  expect(denied.status()).toBe(403);
  const noFinance = await page.request.get(
    "/api/analytics/inputs?storeId=" + store.id,
  );
  expect(noFinance.status()).toBe(403);
  const publicMetrics = await page.request.get(exportUrl);
  expect(publicMetrics.ok()).toBeTruthy();
  expect(await publicMetrics.text()).not.toContain("Attributed net revenue");
});
