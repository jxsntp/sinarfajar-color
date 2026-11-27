# Sinar Fajar pilot handover

## Administrator

Sign in under the assigned organization. Verify store membership, maintain catalog and pricing, and register only expected kiosk or cashier devices. Deliver setup credentials through an approved private channel and enroll them on the assigned device. Revoke retired or compromised devices immediately. Confirm the new device heartbeat and test QR or cashier scope before closing the change. Review catalog and inventory audit history. Use AI Lab on synthetic cases and obtain approved provider and budget before enabling paid traffic. Record the active experiment, observation window and comparison group before interpreting differences.

## Sales associate and cashier

Open the store queue at shift start. Acknowledge new requests promptly and aim for two minutes during the pilot. Assign the request, confirm the product and cabinet, then update Preparing, Ready, Completed or Cancelled. Scan the product code in the staff workflow when recording physical interaction. Let the customer confirm the try-on independently when offered. Cashiers scan the dedicated checkout code from the customer's phone and reconcile it to the verified transaction reference and actual purchased lines. Avoid copying private report links into POS, support or staff chat. Record refunds and cancellations against the original verified sale. Use the authorized CSV path while the vendor adapter is pending.

## Catalog and product import

Use Admin Catalog to preview a CSV, map headers and read row errors. Include SKU, name, brand, category, metal color and purity, store price and on-hand count. Match the store, inventory timestamp and cabinet locations on a small sample before committing. Resolve duplicate SKUs before import. Confirm new lines, photographs and price precision in the catalog and a synthetic mobile query. Product photos must be approved JPEG, PNG or WebP catalog images. Use the inventory reconciliation procedure to correct stale or conflicting data.

## Kiosk setup and support

1. Provision a mini PC with a supported Windows or Linux build, current Chromium or Edge, automatic security updates and a dedicated restricted kiosk OS account. Configure power recovery and startup under the restricted account. Lock down remote administration to authorized support with MFA. Keep staff accounts out of the kiosk browser profile.
2. Use a dedicated profile and managed launch equivalent to `chromium --kiosk --user-data-dir=<dedicated-profile> https://<approved-origin>/kiosk`. Launch automatically on sign-in or through the supported kiosk policy. Test restart and verify the attract screen. Confirm the browser honors camera, origin and permission settings.
3. Connect the touchscreen, set native resolution and test taps, focus, reachable controls, scroll and dwell. Validate camera field of view, stable lighting and neutral background. Compare manual warm, cool, neutral and uncertain samples. The camera is optional, and automatic classification remains off pending specialist validation.
4. Register the assigned device and enroll it at the kiosk, then confirm heartbeat. Test a live mobile QR scan under store lighting using independent iOS and Android devices. Confirm QR handoff and session reset leave the phone report usable while returning the kiosk to attract.
5. Test store Wi-Fi loss and recovery. The browser queues bounded telemetry with stable event IDs. Reconnect and check event delivery and absence of duplicates. Keep inventory freshness enforcement enabled. If the kiosk cannot reach the service, use the approved manual retail process.
6. During remote support, redact private URLs, device keys, report tokens, contact addresses and payment detail. Collect the endpoint request ID, safe kiosk label, store and time. Revoke and re-enroll a compromised device instead of redistributing its key.

## Customer privacy

Frames remain in the browser camera preview and local quality checks. No raw face images or landmarks belong in storage, events, support artifacts or provider requests. OpenRouter receives approved product attributes and catalog-grounded preferences for explicit discovery, with optional derived color tone. The private report offers marketing and camera consent withdrawal and report deletion. Deletion removes session-level history and removes attribution links while preserving transaction and quota ledgers. Marketing withdrawal stops consent-based contact and clears stored later-contact email for that report. Confirm customer notice, provider retention and region, live and backup retention, staff access and data-request escalation with the client privacy owner before release.

## Incident response

Treat suspected cross-store access, leaked tokens, unexpected inference and private data exposure as urgent. Record time, synthetic request ID and affected surface. Restrict access, revoke exposed devices or credentials, disable paid inference or the exposed surface where safe, and involve the designated operations and privacy leads. Preserve sanitized evidence. For stale stock or outage, stop promising availability, use the manual store fallback, and reconcile backlogs after recovery. Check readiness, event deduplication, staff queues and provider charges before reopening. Record communications, root cause and corrective actions in the client's approved incident system.

## Pilot evaluation

Review availability during store hours, QR issuance and human mobile opens, explicit activations, unique recommendation impressions and clicks, AI latency and cost, fallback, stock discrepancies, acknowledgment times and linked POS coverage. Inspect Puri Mall hardware and device connectivity by shift. Compare observed outcomes to the pilot thresholds, document denominators and the effect of deletion or missing capture, and use a valid comparison before attributing incremental sales.
