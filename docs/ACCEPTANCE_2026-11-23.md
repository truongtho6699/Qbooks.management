# Upload recovery acceptance — 23 November 2026

## Implemented

- Completed upload fingerprints remain available until the packing or shipment commit succeeds. A failed order commit can reuse the same file record.
- POST /api/uploads/:id/restart-drive verifies permissions, order lock and Drive expiry before replacing a session on the same upload record. A compare-and-swap prevents concurrent overwrites.
- The browser retries an expired session once and rejects impossible or regressing Drive offsets.
- Background messages distinguish storage confirmation from order completion and do not mislabel direct Drive uploads as R2.
- public/404.html provides a missing-page response for Pages static hosting.
- Windows CRLF no longer breaks the selected-file preview assertion.

## Verification

Run npm test and npm run check. At this revision all 181 tests pass, including API handler tests with simulated D1/Google responses, expired-session recovery, permission denial and offset validation.

Run node scripts/smoke-production.mjs https://your-preview.example against the intended deployment for read-only health, security header, anonymous API and missing-page checks. The script exits with 1 when a condition is unmet. Keep operational results in private records.

## Remaining acceptance

- Test a large video against an isolated staging Drive folder, interrupt its network connection, reopen the page and verify file identity, size and destination.
- Test desktop and mobile browser interactions and existing Google authentication.
- Verify Cron deployment, credentials, run history and housekeeping in private operational records.
- Independently reconcile existing R2 and Drive copies before enabling any verified move.
- The current background task requires an open browser tab. Durable IndexedDB queues, multiple simultaneous order jobs and saving packing before video completion remain separate work.
- Asset cache revalidation exists; content-hashed module releases remain separate work.

Keep customer records, secrets and operational inventories in private records.
