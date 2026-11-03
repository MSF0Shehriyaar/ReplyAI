# Automation platform

Two Next.js applications share a Node gateway and server-managed AI connections. Instagram and owner oversight are private. Registered WhatsApp businesses receive isolated workspaces. The Expo administrator and business applications use separate session flows.

## Run

Use Node 22.13 or later and the pnpm workspace under `web/`. Install workspace dependencies with `pnpm install`. The repository root separately owns the Expo workspaces.

From `web/`, run `npm run dev` for development or `npm run build` followed by `npm start` for a built service. The gateway uses `PORT` (default 10000) and routes to the Instagram and WhatsApp services on ports 3000 and 3001. Use the gateway for the production route layout.

The gateway reads `web/.env` locally; production must receive environment variables from the hosting service. Never commit runtime secrets. Configure `SESSION_SIGNING_KEY` with at least 32 random characters, `CREDENTIALS_KEY`, and the database settings before starting production. The gateway rejects missing session security at startup; `/api/health` reports unavailable when session configuration or the database is unavailable. AI credentials are encrypted in server storage and never returned to clients.

## Boundaries

- Instagram and private WhatsApp administration require a valid, revocable owner session.
- Business APIs authorize the user role and tenant on every request. Browser mutations require an allowed origin; mobile sessions follow their own token flow.
- Private service requests require a signed server bridge. Public requests cannot supply that proof or forward owner credentials through the business gateway.
- Webhooks require signatures. Saved messages enter persistent queues; uncertain delivery requires owner review before sending again.
- Catalog checkout records a pending reference with structured address details. The matching WhatsApp sender confirms the order in chat. Generated AI text cannot create a confirmed order.
- Provider fallback follows the administrator's approved list. Invalid credentials and declined requests require review; explicit quota failures can use an approved backup.

## Verification

From `web/`, run `npm test` for the isolated service tests. These cover owner authentication, tenant isolation, webhook signatures, catalogs, confirmation, message recovery and provider routing without sending real messages.

From the repository root, run `npm run typecheck:mobile` for both Expo applications. After building the web applications and exporting the business Android bundle into `outputs/expo-business`, run `npm run check:public-bundles` to check for private branding, owner routes and accidentally included demo content.

## Local demonstration

`demo/` is excluded from production. It reuses the business dashboard, catalog and reply-rule matching, while keeping customer data in local SQLite. Follow `demo/README.md` for startup, model setup and local checkout. `npm --prefix demo test` runs its isolated tests.

The demo can use the administrator's configured AI providers as a live service; its local English model starts with the Node application. A local catalog URL works on the same PC. Remote customer phones require a reachable HTTPS address.

## Release checks

Passing local tests and builds does not verify hosting secrets, provider quotas, Meta permissions, device connection, phone layout or actual delivery. Verify these in the intended environment before release. Keep approval enabled while validating a new business profile or provider.
