# Security implementation and release status

The reviewed isolation and authentication defects have been addressed in source. This is a locally verified implementation, not a production security certification.

## Implemented
- Composite tenant keys for customers, orders, threads, events and jobs prevent cross-business collisions.
- Transactional migrations preserve existing records. Populated tables without ownership require an explicit LEGACY_WHATSAPP_TENANT_ID; existing tenant ownership is preserved.
- Business registration and master-admin client creation; admin creation keeps the admin's session.
- Tenant authorization, operator restrictions, suspension checks, durable login/registration limits, strict mutation validation and origin checks.
- Business credentials encrypted with tenant-specific authenticated encryption context. Business provider/status responses no longer read another tenant's configuration.
- Verified Cloud API phone ownership, unique phone mappings, required webhook signatures, no default-tenant routing for unknown phones.
- Atomic event deduplication/enqueue, exclusive queue claims, tenant propagation, and outbound delivery reservations. Uncertain delivery requires review rather than an automatic resend.
- Database-backed business and owner session checks. Expired, revoked, deleted or suspended sessions fail closed.
- Closed legacy Instagram WhatsApp APIs; gateway no longer falls back between services for workspace requests.
- Admin business selection and connection requests carry the selected tenant. Empty catalogs stay empty. Business logout is available.
- Per-business device folders use .wa-tenants; logging out the legacy primary device does not recursively erase other businesses' device folders.
- Removed plaintext owner PIN writes and webhook verify-token logging.

## Local verification
Run from the repository root:
```
node --import ./web/test-loader.mjs --test web/security-session.test.mjs web/multi-tenant-security.test.mjs web/tenant-integration.test.mjs
```
15 checks passed, including actual API handlers against an isolated in-memory database, tenant record collisions, admin access, registration, revocation, migration rollback/preservation, credentials, CSRF, operator restrictions, replay/queue ownership and outgoing retry deduplication.
Both TypeScript checks and both production builds passed. Nine existing Instagram webhook-signature, provider-limit and limit-metadata tests also passed.
The WhatsApp lint command is blocked because the project has no ESLint 9 configuration file. Git diff whitespace checks pass.

## Deployment prerequisites
- SESSION_SIGNING_KEY: random secret of at least 32 characters, shared between services.
- CREDENTIALS_KEY: 64 hex characters; retain the existing encryption key to preserve access to existing credentials.
- NEXT_PUBLIC_APP_URL: exact public origin used by the dashboard.
- TURSO_DATABASE_URL and TURSO_AUTH_TOKEN: database connection.
- LEGACY_WHATSAPP_TENANT_ID: explicitly confirmed business ownership for populated legacy records lacking a tenant column. Take a database backup and validate on staging before running the application against an existing database.
- Existing owner credentials remain usable. If none exist, provision OWNER_PIN with at least 12 characters. Public owner signup stays disabled.
- Configure platform WhatsApp app secret and verification token through the master administrator; configure business credentials separately.
- Existing owner cookies must sign in again because sessions now require server records.

## Release limitations
- Production database and deployment were not changed.
- Real Meta credentials, live QR pairing, provider delivery receipts and complete browser workflows still require staging verification.
- Business operators have server-enforced restrictions; a full user invitation/role-management UI and password recovery are not included.
- Deletion deactivates a business and retains its history/audit records; data-erasure policy and retention controls need an explicit product decision.
- Background jobs are durable, but a continuously scheduled drain and multi-instance ownership of live Baileys sockets remain deployment work.
- Catalog storefront still uses the original static catalog and phone number; it needs a separate tenant-specific public storefront design before sharing business catalog links.
- Existing stored plaintext owner PIN fields are removed on successful password login; legacy PIN-only users must use their password or reset credentials.
