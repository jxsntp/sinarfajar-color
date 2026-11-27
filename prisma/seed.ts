import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

const db = new PrismaClient();
const localAuthUrl = "http://127.0.0.1:25421";
const demoStaffEmail = "staff@sinar-fajar.test";

function isLocalDatabase(value: string | undefined) {
  const url = URL.parse(value ?? "");
  return (
    url?.protocol === "postgresql:" &&
    url.host === "127.0.0.1:25422" &&
    url.pathname === "/inaura_dev" &&
    (url.search === "" || url.search === "?schema=public")
  );
}

async function seedLocalStaff(organizationId: string) {
  const password = process.env.LOCAL_DEMO_STAFF_PASSWORD;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!password || !publishableKey) {
    console.error(
      "Demo staff setup requires the local Supabase key and password. Run node scripts/local-storage.mjs with the .env.example settings.",
    );
    throw new Error("Missing demo staff configuration");
  }

  const { auth } = createClient(localAuthUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const credentials = { email: demoStaffEmail, password };
  let login = await auth.signInWithPassword(credentials);
  if (login.error?.code === "invalid_credentials") {
    const { error } = await auth.signUp(credentials);
    if (
      error &&
      error.code !== "user_already_exists" &&
      error.code !== "email_exists"
    ) {
      console.error(
        "Demo staff signup failed:",
        error.code ?? "auth_unavailable",
      );
      throw error;
    }
    login = await auth.signInWithPassword(credentials);
  }
  if (login.error || !login.data.session || !login.data.user) {
    console.error(
      "Demo staff login failed:",
      login.error?.code ?? "missing_session",
    );
    throw new Error("Could not verify the demo staff identity");
  }

  const userId = login.data.user.id;
  await db.$transaction([
    db.userProfile.createMany({ data: { id: userId }, skipDuplicates: true }),
    db.membership.createMany({
      data: { organizationId, userId, role: "ORG_ADMIN" },
      skipDuplicates: true,
    }),
  ]);
  console.log(`Local demo staff account ready: ${demoStaffEmail}`);
}

async function seed() {
  if (process.env.APP_ENV !== "development")
    throw new Error("Synthetic seed requires APP_ENV=development");
  const org = await db.organization.upsert({
    where: { slug: "sinar-fajar" },
    create: { slug: "sinar-fajar", name: "Sinar Fajar", accent: "#61394c" },
    update: {},
  });
  const organizationId = org.id;
  const storeKey = { organizationId, code: "PURI" };
  const store = await db.store.upsert({
    where: { organizationId_code: storeKey },
    create: { ...storeKey, name: "Puri Mall" },
    update: {},
  });
  const samples = [
    {
      brand: "Arunika Studio",
      sku: "DEMO-A01",
      name: "Aurora Pendant",
      category: "necklace",
      goldColor: "yellow",
      price: "3500000.00",
    },
    {
      brand: "Embun Atelier",
      sku: "DEMO-E01",
      name: "Dew Band",
      category: "ring",
      goldColor: "white",
      price: "4250000.00",
    },
    {
      brand: "Arunika Studio",
      sku: "DEMO-A02",
      name: "Demo Rose Hoops",
      category: "earring",
      goldColor: "rose",
      price: "2750000.00",
    },
    {
      brand: "Embun Atelier",
      sku: "DEMO-E02",
      name: "Demo Gold Chain Bracelet",
      category: "bracelet",
      goldColor: "yellow",
      price: "3100000.00",
    },
  ];
  for (const sample of samples) {
    const brandKey = { organizationId, name: sample.brand };
    const brand = await db.brand.upsert({
      where: { organizationId_name: brandKey },
      create: brandKey,
      update: {},
    });
    const productKey = { organizationId, sku: sample.sku };
    const product = await db.product.upsert({
      where: { organizationId_sku: productKey },
      create: {
        ...productKey,
        brandId: brand.id,
        name: sample.name,
        category: sample.category,
        goldColor: sample.goldColor,
        purity: "18K",
      },
      update: {},
    });
    const stockKey = {
      organizationId,
      storeId: store.id,
      productId: product.id,
    };
    await db.inventory.upsert({
      where: { organizationId_storeId_productId: stockKey },
      create: { ...stockKey, onHand: 3, price: sample.price },
      update: {},
    });
  }

  if (
    process.env.SUPABASE_URL === localAuthUrl &&
    isLocalDatabase(process.env.DATABASE_URL) &&
    isLocalDatabase(process.env.DIRECT_URL)
  ) {
    await seedLocalStaff(organizationId);
  }
}
seed()
  .catch(() => {
    console.error(
      "Synthetic seed failed. Check the development configuration, Auth health, and migration status.",
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
