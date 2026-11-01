# Nina platform update — 2 November 2026

The private WhatsApp administrator now lives inside the Instagram owner app. The public WhatsApp business app is a separate build and experience. Both use the existing production domain.

## Current entry points

| Area | Production path | Direct local development |
| --- | --- | --- |
| Private Instagram | / (owner sign-in at /login) | http://localhost:3000 |
| Private WhatsApp management | /whatsapp | http://localhost:3000/whatsapp |
| Public business sign-in/registration | /business | http://localhost:3001/business |
| Public business catalog | /business/catalog?business=ID | http://localhost:3001/business/catalog?business=ID |

The gateway sends /business pages, APIs and assets to the business app. Private assets remain with Instagram. It no longer retries missing assets against the other application. Legacy /api/whatsapp/* webhooks/API links and /catalog links are forwarded to their public /business equivalents.

Public pages, responses and customer bundles contain no Nina branding, owner-cookie names or private admin endpoint references. The existing hostname itself contains the owner's name and remains the shared hostname, as requested. Route names can be guessed; owner authentication is the security boundary. An owner sign-in page is necessarily reachable without an owner session. This is not a claim that the administrator's address can be made undiscoverable.

## Implemented

- Owner cookie decoding and stored-session checks are consistent across login and private endpoints. Owner pages now enforce access on the server. Login preserves an allowlisted WhatsApp return destination.
- The WhatsApp administrator UI moved into Instagram. Its private API proxy requires a valid owner session and forwards a short-lived signed server request. Public business routes ignore owner cookies and reject owner bearer tokens. Public /business/api/admin returns 404 without a valid internal proof.
- The bridge binds method, canonical request path, query, owner token and timestamp. It handles Next's basePath normalization and rejects altered or expired proofs. Client-facing responses exclude the proof, upstream cookies and private transport headers.
- Browser origin checks remain required for cookie mutations. Native mutations require valid revocable bearer sessions. The public gateway strips owner cookies and internal proof headers before forwarding business traffic, including WebSocket upgrades.
- Private responses use no-referrer and noindex policies. Unexpected Instagram errors return generic client messages. Owner and business sign-outs revoke their own sessions independently.
- The administrator can inspect businesses, users, account creation, last sign-ins, activity, sessions, IP/device metadata where recorded, connection state, usage, orders, queues, provider cooldowns and audit history. Lists are paginated; sessions can be revoked.
- Businesses keep isolated profiles, catalogs, conversations, customers, orders, settings, credentials, analytics, queues and logs. Administrative access does not change the owner's identity.
- WhatsApp uses verified administrator AI providers on the server. Shared fallback/cooldowns and Cloudflare account/model compatibility are retained. Business responses exclude provider keys and private provider configuration.
- Catalogs use current tenant products, prices, stock, categories and enquiry numbers. Public fields are allowlisted. Empty catalogs remain empty.
- Business profile setup explains each required field. Incomplete profiles cannot enable automatic replies. Business-specific voice, language, instructions, examples, approvals, chat permissions, delays, daily limits, rules and previews remain available.
- A verified international WhatsApp number can belong to only one workspace. Members of the same workspace share its connection.
- The Node queue worker supports persisted jobs, retries, expired-lease recovery, duplicate-reply protection and permission checks before automatic delivery.
- Legacy unowned WhatsApp records require an explicit LEGACY_WHATSAPP_TENANT_ID mapping instead of silent assignment.
- Both web experiences share light purple, white and slate tokens, readable fonts, form/focus states and restrained transitions. Public CSS token names are neutral.
- Hydration-sensitive sidebar text is deterministic, with SVG icons. The initial clock value is passed from the server.
- Two native Expo React Native applications replace the old standalone PIN-based Expo playground. They have separate package IDs, entry modules, secure session keys and EAS build profiles. See MOBILE_APPS.md.

## Verification

- Both web apps pass production builds and TypeScript checks.
- Both native apps pass TypeScript checks and Android Hermes export. Bytecode exports are not installable APKs.
- The focused regression suite passes **44 checks with zero failures**. Output: outputs/platform-regression-tests.txt.
- Coverage includes owner browser/native login and revocation, business native registration and revocation, tenant isolation, CSRF, mandatory webhook signatures, encryption, private bridge signatures/base paths, public admin rejection, gateway routing and header separation, catalog updates, shared AI fallback, profile requirements, approvals, number ownership, queue recovery, duplicate prevention, permission changes, admin visibility, location handling and migration ownership.
- Provider and delivery regression tests use isolated databases and mocked upstream calls. No production business was created and no live message/provider test was performed for this verification.
- Browser checks confirmed the private /whatsapp dashboard loads real registrations, users, sessions and system data under the existing owner login. The public business sign-in and registration screens remain neutral even in the same browser as the signed-in owner. Instagram loaded without hydration warnings or console errors.
- Final customer web and Android artifacts were scanned for private branding, owner-cookie names and admin endpoints using mobile/check-public-bundles.mjs.
- Current desktop screenshots: outputs/whatsapp-business-public-desktop.png and outputs/nina-private-whatsapp-desktop.png. Earlier screenshots under outputs/nina-admin-* predate the route separation. The browser viewport override did not apply in this run, so the latest phone layout was not visually certified.

## Remaining release and operational work

- No deployment, EAS project linking, signing, APK/AAB build or store submission was performed. Deploy both backend services together and link two separate EAS projects before distribution.
- Native apps have not been run on a physical Android device or emulator. Verify keyboard/safe-area behavior, QR pairing, session restoration, real AI responses and real delivery on devices before release.
- The online mobile dependency audit reports 11 moderate Expo build-tool advisories through glob/minimatch, with no high or critical advisories in that audit. Automatic suggested remediation downgrades Expo and was not applied. Offline audit output does not resolve these findings.
- The historical Instagram connections-integration VM harness remains incompatible with current imports and older automation assumptions. It is not a passing full Instagram automation certification; current owner APIs have separate passing tests.
- Daily business usage starts with this update. Unrecorded historical usage cannot be reconstructed reliably. Older sessions may lack activity/device metadata.
- Device connection state describes the current Node server; configured Cloud credentials do not prove live upstream availability.
- The queue worker needs a running Node process and persistent QR storage. Multi-instance device ownership and serverless scheduling require additional infrastructure if used.
- Customer delivery requires a linked number, complete business profile, available provider, enabled automation and the chosen approval policy.
- Read-only owner record inspection confirmed the registered username and saved password hash. The record has no email field. No credentials were changed.

Run from the repository root:

```powershell
node --import ./web/test-loader.mjs --test web/auth-entry.test.mjs web/location-service.test.mjs web/security-session.test.mjs web/multi-tenant-security.test.mjs web/shared-business-ai.test.mjs web/owner-route-auth.test.mjs web/tenant-integration.test.mjs web/mobile-business-auth.test.mjs web/gateway-routing.test.mjs
npm run typecheck:mobile
npm run check:public-bundles
```
