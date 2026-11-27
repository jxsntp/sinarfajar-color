# Deployment, backup and rollback

## Environment requirements

| Resource | Development | UAT | Production |
|---|---|---|---|
| Next runtime | Local Node 22 and Compose | Dedicated HTTPS Vercel app or protected UAT deployment | Separate Vercel project or protected production environment |
| PostgreSQL, Auth and Storage | Loopback fixture services | Dedicated Supabase project and test accounts | Separate Supabase project, named and reviewed staff accounts |
| Domains and certificates | Loopback HTTP | Stable UAT HTTPS origin for QR and browser session | Client-approved HTTPS origin |
| AI and automation | Mock transport and no external secrets | Dedicated approved API credentials and capped spend | Distinct restricted keys, explicit approval and billing alerts |
| Data | Synthetic fixtures | Approved UAT data | Approved catalog and verified inventory |

Set `APP_ENV` appropriately and keep `APP_ORIGIN` and `REPORT_ORIGIN` equal to the exact HTTPS origin for each hosted environment. Configure `sslmode=require` or stronger for both database URLs. Use a dedicated runtime role with only the app's required table/sequence access and separate migration credentials. Provision the three unrelated secrets `SECURITY_KEY`, `INBOUND_JOB_SECRET`, `MONITOR_TOKEN` and optionally a fourth `OPS_N8N_SIGNING_KEY`. Use server-only secret stores. Set a store-approved `INVENTORY_MAX_AGE_MINUTES` or explicitly set it to `off` to disable the inventory age cutoff. Inventory lookup still uses the stored price and stock. Configure independent OpenRouter provider allowlists, usage caps and credentials per environment. Keep `ENABLE_HOSTED_OPENROUTER=false` until the environment owner approves paid access. Seed only synthetic development data. Provision staff in the correct Auth project and check their organization and store assignments.

The runtime uses server-side Prisma for tenant scoping. Supabase direct customer roles must have no app-table write access. Confirm the hosted runtime and migration grants, composite constraints, RLS and API exposure against deployment-role identities. The `product-photos` bucket holds public catalog images only. Require the restricted server credential for uploads and test anonymous read and denial of anonymous create, replace and delete. Store no camera data, report attachments or customer uploads there.

Disable or redact request logs, tracing, error collection and Vercel drains that capture raw `/results/<bearer>` paths, Authorization, cookies, signed job bodies or private contact addresses. Verify the entire request path including edge, redirects, load balancer, external monitor and support tools with synthetic values. The mobile route returns no-store and no-referrer headers. Next incoming-request logging is off. Browser hydration still uses inline scripts permitted by CSP. Hosted log redaction and role grants require acceptance evidence.

## Validate configuration before a release

Use an ignored environment file for the selected deployment and check it against the app's runtime schema before entering settings in Vercel.

```bash
npm run check:env -- --file .env.vercel --target production
```

Use `--target preview` with `APP_ENV=uat` for a Vercel preview. The command lists invalid variable names without printing their values. With Vercel system variables enabled, the same check runs before the project's `npm run build`. A passing check validates configuration syntax and relationships. Check database connectivity and migrations separately. The readiness endpoint also verifies that the kiosk's organization exists and its inventory and photo catalog tables can be queried.

## Release procedure

1. Use GitHub verification on the exact revision. UAT and production deployment require their respective protected environments and approved release artifact.
2. Record the current revision, applied migration IDs, configuration version and backup identifier. Check that backups are restorable, storage and Auth recovery are documented, and operations has an escalation contact.
3. Apply `npm run db:migrate` to UAT with the migration role. Review lock duration and migration history. Confirm the Prisma schema diff and execute UAT against the intended UAT application and identity project.
4. Check application readiness and monitoring, privacy, inventory freshness, manual camera pass and cashier linkage. Verify signals reach an on-duty recipient.
5. Obtain written Sinar Fajar acceptance and project-owner deployment approval. Schedule a staffed window and review device expiry, migration plan, rollback criteria and stop conditions before any production change.
6. Run the reviewed migration with approved production credentials and deploy the verified artifact only after both approvals. Smoke-test critical workflows with dedicated approved accounts.

## Backup and rollback

Before a migration, retain an encrypted database backup or approved provider recovery point and record the recovery timestamp. Verify Auth identities and Storage objects separately, including blob versioning and access policy. Do not share SQL archives containing real contact addresses or access metadata. Set access, encryption, retention, RPO and RTO with the client.

Rehearse on an isolated restore target. For custom-format logical backups, create a distinct empty database and run `pg_restore --exit-on-error --no-owner --dbname=<isolated-restore-target> <approved-dump>`. Use approved secrets and secure transfer. Inspect migration history and compare sampled organization/store/catalog counts, grants and application readiness. The Phase 5 synthetic local restore uses the ignored Docker file `/tmp/inaura-phase5-local.dump` and the separate local `inaura_restore_p6` target.

If app rollback is needed, stop new customer activations and automated jobs if needed, restore the previous verified application artifact and compatible configuration, and retest critical paths. Phase 6's migration is additive except for loosening the required inference link. Before enabling deletion and retention, verify the old app against the migrated schema including detached inference rows. After erasures, exercise rollback in UAT or ship a compatible forward fix. Revoked or erased personal data must remain inaccessible. Restore over the active database only under a separately approved recovery operation. Test reconciliation and replay approved erasure records before reopening a recovered environment. Never run migration reset against hosted data.

## Monitoring and scheduling

Poll `/api/health/live` and `/api/health/ready` every minute from representative locations. Record store-hour availability in the store timezone and check the pilot target of 99.5%. Alert for two consecutive failures, then confirm app, database and kiosk connectivity independently. Use `GET /api/internal/monitor` with the distinct monitor bearer key. The endpoint returns aggregate counts over a rolling 24 hours without customer or device identifiers. Thresholds cover missing activation, five-second OpenRouter p95, the configured spend limit, interrupted runs, 25% fallback after ten completed runs, five delayed events, three API errors and a kiosk heartbeat gap beyond five minutes. Use store-hour paging for devices. Observe the QR issuance/display difference and any sustained handoff or CTR drop after a baseline exists. Late arrivals measure observed event delay. Actively test synthetic delivery to detect failures that never reach the app.

Schedule signed `POST /api/internal/jobs` for retention and optionally alert dispatch. Send `x-inaura-timestamp` as decimal Unix seconds, a new `x-inaura-nonce` and the hex HMAC-SHA256 of the exact UTF-8 `timestamp.nonce.body` with the inbound job key. Server tolerance is five minutes. Authorize the sender and rotate independent secrets on compromise. Use a new nonce after an acknowledged failure. An alert dispatch payload names the target store; a retention payload carries the action only and processes at most 20 candidate sessions per invocation. Start conservatively and check backlog on hosted UAT before enabling production jobs. The optional outbound n8n signature uses an independent key and the receiver must enforce timestamp, signature, nonce or idempotency controls. Keep alerts and retention disabled until operated by an approved service.
