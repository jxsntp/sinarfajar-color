# Local development

Use Node.js 22.13 or later, npm and Docker. Run these commands in the application root.

```powershell
if (!(Test-Path .env)) { Copy-Item .env.example .env }
npm ci
node scripts/local-storage.mjs
docker compose up -d
Invoke-RestMethod http://127.0.0.1:25421/auth/v1/health
node scripts/local-photo-bucket.mjs
npm run db:migrate
npm run db:seed
npm run dev
```

Wait for the Auth health endpoint to report its version before migration. Open `http://localhost:3000/kiosk`. The local Compose fixture runs PostgreSQL 17, Supabase Auth, Supabase Storage and a gateway. It uses synthetic credentials, local email auto-confirmation and loopback ports 25421 and 25422. The Storage script prepares local-only credentials in the ignored environment file. Stop the services with `docker compose stop` to preserve catalog data and photographs.

For a hosted Supabase project, set separate database, direct migration and Auth URLs, a publishable key and `APP_ENV` for each environment. Prisma uses the server-side database connection and the migration connection needs DDL privileges. Set up Auth before running migrations. Use a dedicated trusted server role with the required table access and RLS bypass, keep it outside frontend bundles and restrict its network access. Restrict infrastructure logs to redact private report paths. Only development environments accept the synthetic seed command.

## Staff and device setup

For the local Docker demo, the seed creates `staff@sinar-fajar.test` as an Organization Admin for `sinar-fajar`. The setup script generates the password once per `.env` file. If the local stack is already running and migrated, run these commands from the project folder in CMD to add the account and display its password.

```cmd
node scripts/local-storage.mjs
npm run db:seed
findstr /B "LOCAL_DEMO_STAFF_PASSWORD=" .env
```

Sign in at `/login` using `sinar-fajar`, the demo email and the text after `=` in the CMD output. The demo account is provisioned only against the loopback Docker Auth and database services.

For other staff accounts, create the identity in Supabase Auth. Use its verified UUID to provision a profile and membership in a trusted database administration session. Replace the parameters in this transaction with the approved identity, organization slug and role. A store manager or sales associate also needs the assigned store ID. Organization-wide roles require a null store. Provision a platform administrator separately by setting the trusted profile flag.

```sql
BEGIN;
INSERT INTO "UserProfile" (id, "updatedAt")
VALUES (:auth_user_id, now()) ON CONFLICT DO NOTHING;
INSERT INTO "Membership" (id, "organizationId", "userId", "storeId", role, "updatedAt")
SELECT gen_random_uuid(), id, :auth_user_id, :store_id, :role::"StaffRole", now()
FROM "Organization" WHERE slug = :organization_slug;
COMMIT;
```

Sign in at `/login`. An organization administrator can register a kiosk for an assigned store in `/admin`. Enter the resulting one-time device key under the device connection control at `/kiosk`. Device revocation is available through the admin API. Staff authorization checks Supabase Auth and the current membership on each protected request. The HTTP-only staff cookie expires with the access token. Sign in again after expiry.

## Verification

```powershell
npm test
npm run test:integration
npm run lint
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
```

The integration and browser suites enforce the local Compose database name, host and ports and create uniquely named fixtures. Browser tests start the production build on port 3308. An installed Edge browser can be used with `PLAYWRIGHT_CHANNEL=msedge`. Unit tests require no running database.

## Catalog and discovery configuration

The admin catalog supports an existing tenant-prefixed photo object or a raster upload up to 4 MiB. For hosted Storage, provision the public `product-photos` bucket, restrict uploads to the trusted server and set `SUPABASE_STORAGE_KEY` in that environment. Only public product photography belongs in this bucket.

Rules are the initial ranking strategy. To enable paid mobile inference in an approved environment, configure the server-side `OPENROUTER_API_KEY`, comma-separated `OPENROUTER_MODELS` and `OPENROUTER_PROVIDERS`. Then select the model and provider and save the OpenRouter strategy in `/admin/ai-lab`. The example environment lists timeout, output token ceiling, attempt limit, provider price ceilings, per-run spend and daily organization budgets. Apply an upstream credit limit to the deployment key. The automated tests use synthetic provider responses.

### Try the photo-only catalog

Open `/admin/catalog/photos` as an organization admin, choose the kiosk's store, and upload one design per image. Use the AI tag option if configured, then review the apparent metal, up to three accent colors, shape and style before publishing. Use at least one photo in each of the four categories to test the full mobile selection. Scan a QR created by the localhost camera trial, register with three fields and activate recommendations. A photo selection shows styling information. Staff can confirm commercial details separately.

For live vision suggestions, add the server-side `OPENROUTER_API_KEY`, a vision-capable `OPENROUTER_VISION_MODEL` and its `OPENROUTER_VISION_PROVIDER`. Include the model and provider in `OPENROUTER_MODELS` and `OPENROUTER_PROVIDERS`. The approved endpoint must accept image inputs and structured responses within the configured routing and budget limits. For AI ranking on the phone, save an approved OpenRouter strategy in **AI laboratory**. Photo review and rules ranking also work with manually entered tags.

## Phase 3 kiosk and mobile setup

Set `REPORT_ORIGIN` to the storefront's trusted public HTTPS origin in UAT or production. The development default is `http://localhost:3000`; a phone cannot open a loopback link from another device. Keep the deployed origin out of request-derived host headers. Report validity defaults to the proposed 30 days and remains configurable through `REPORT_TTL_DAYS`. In-store requests are accepted for two hours from kiosk start; later contact remains available through the report. Browser tests use a dedicated loopback origin on port 3308.

An approved HTTPS social profile can be configured with `PUBLIC_SOCIAL_URL`. The mobile ranking experiment assigns eligible sessions 1:1 when a tenant selects OpenRouter and both the model and provider are approved. `ENABLE_MOBILE_EXPERIMENT=false` keeps the configured strategy without random assignment.

The kiosk camera quality check uses a guided face region and an optional gray reference. Exposure compensation and color-temperature controls appear when the device browser reports support. Automated classification requires specialist validation. The implementation uses browser camera and canvas APIs. Report cards only include brand and selected palette; the camera feed is independent of the share-card canvas.

## Phase 4 POS and inventory setup

The `/staff` portal accepts camera scans or keyboard scanner input. Camera scanning requires a secure browser origin. Add a catalog barcode in product administration, or print a project QR containing `sinar-fajar:sku:SKU`. Cashiers record or import the receipt before linking it with the separate QR displayed in the customer's private report. A valid cashier code expires in 15 minutes. `ATTRIBUTION_WINDOW_MINUTES` defaults to 180 minutes from kiosk start to sale time.

Use `/staff/sales` as a store manager or administrator. The mock adapter is for test data and its records are labeled. The CSV adapter accepts the following columns:

```csv
type,externalRef,occurredAt,currency,total,sku,quantity,unitPrice,checkoutCode,adjustmentRef,amount
sale,RECEIPT-001,2026-11-26T08:00:00Z,IDR,250000.00,DEMO-A01,1,250000.00,,,
refund,RECEIPT-001,2026-11-26T08:10:00Z,,,,,,,REFUND-001,50000.00
```

Group one row per line item by a shared external reference, store, sale timestamp, currency and total. Sum of line amounts must equal the gross total. Use `cancel` with a unique adjustment reference to reverse the remaining balance. Preview parses groups; commit validates live catalog and sales data and reports a result per group. An expired optional cashier code leaves a valid sale unmatched for reconciliation. Inventory snapshots affect previously configured store/SKU rows and ignore older observations. Import or POS integrations must keep prices and stock authoritative independently.

Internal alerts remain active without an automation provider. Optional server-side delivery uses `OPS_N8N_WEBHOOK` and `OPS_N8N_TOKEN`. A scheduler can call the dispatch action on `/api/operations/alerts` with `OPS_JOB_TOKEN` as its bearer and a store ID in the body. Configure the n8n webhook to deduplicate by alert ID. Payloads contain alert identifiers, type, store and time. Failed handoffs can retry after their lease.

### External POS and inventory blockers

Obtain the vendor and approved API version, sandbox and server-side credentials, authorized webhook or export mechanism, store and SKU mappings, timestamp and transaction ID semantics, line item and discount/tax rules, refund and cancellation formats, inventory source and freshness agreement, and approved reconciliation examples. Confirm actual scanner hardware, labels and approved automation credentials in UAT.

## Phase 5 reporting setup

Use the management dashboard for distinct-session reporting. Managers can add approved aggregate inputs through `/dashboard/inputs`. Campaigns tag future sessions at the store. Enter disjoint segment counts for store dates with both opening and ongoing trade, and keep source references for each observation. Enter a comparable control and source before interpreting incremental contribution. Use CSV-backed sale records with verified store, receipt and refund provenance. Mock transactions remain visible in operations but are excluded from management sales evidence.

Publish new prompt versions in `/admin/ai-lab` and activate a chosen version through ranking settings. Set the approved OpenRouter model and provider before running a paid synthetic comparison or starting mobile B/C enrollment. Local tests use mocked provider responses. Record sample size, follow-up period, intent-to-treat outcome and comparable staffing, placement and promotions in the experiment protocol. 

