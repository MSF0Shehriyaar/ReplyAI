# WhatsApp entry and theme verification

- Anonymous visitors see account access before any dashboard mounts. Only the session-check endpoint is requested until authentication succeeds.
- Session expiry returns to account access. Background workspace polling pauses on server failure and offers Retry instead of repeating requests indefinitely.
- Anonymous auth checks return HTTP 200 with authenticated=false without database configuration. Anonymous workspace and connection endpoints return HTTP 401 before database initialization.
- Removed the HTML dark class, dark base tokens and remote font stylesheet. Account access uses a single light green/white palette, consistent typography and associated form labels. Dashboard captions now have a minimum 12px size.
- Visually checked sign-in and registration at 390px phone width and desktop width in the local browser. No browser warnings/errors were captured during these checks. No credentials were submitted and no accounts were created in the running application.
- WhatsApp TypeScript and production build pass. Anonymous-entry regression checks pass. Across anonymous-entry, location and tenant suites: 19 pass, 1 fails.
- The remaining failing legacy-migration test predates this change: the local modification to tenant-migration.ts defaults unowned legacy data to biz_titan_watches, while the test requires explicit ownership mapping. That local migration modification was preserved; it needs a separate ownership decision before production migration.

The React DevTools and HMR messages in the pasted log are normal development notices. The repeated failed workspace/connect calls were caused by the dashboard polling before sign-in; the account gate prevents those calls for anonymous visitors. Historical server-side 500 responses cannot be fully diagnosed from browser messages alone.
