# WhatsApp entry and privacy verification

The public business entry is /business. It has neutral WhatsApp Business branding and offers sign-in or registration before mounting any business dashboard. Its assets and APIs use the same /business prefix. The private WhatsApp administrator is /whatsapp inside the Instagram owner application and requires server-validated owner access.

- Anonymous business auth checks return HTTP 200 with authenticated=false before database setup; workspace and device endpoints reject anonymous access.
- Owner cookies cannot authenticate the public business app. Only the owner app's signed server bridge can obtain administrative business access. Public admin requests return 404.
- Public registration always creates a business administrator in a newly isolated workspace. Public login cannot create a master-owner session.
- Native owner and business token exchange endpoints accept explicit credentials, reject browser-origin/cookie exchanges and retain server revocation checks. No provider keys are included in clients.
- Instagram and business logout are independent. Public gateway requests exclude owner cookies and private proof headers.
- Public web and Android artifacts have no Nina branding, owner-cookie names or private admin endpoint references. The existing shared production hostname remains visible.
- The private Instagram sidebar link renders deterministic text and SVG icons; the server supplies the initial clock. Current browser checks produced no hydration warnings.
- Desktop sign-in, registration and private admin views were inspected. A current mobile viewport check could not be applied by the browser tool; native device verification remains pending.
- Both web builds, both native TypeScript checks and both Android bundle exports pass. The focused suite passes 44 checks.
- See PLATFORM_UPDATE_VERIFICATION.md for the detailed findings and limits, and MOBILE_APPS.md for the two native apps and EAS build instructions.

React DevTools/HMR messages are ordinary development notices. Authentication gates prevent anonymous workspace polling. Historical 500 errors cannot be attributed from browser log fragments alone.
