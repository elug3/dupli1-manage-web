---
name: verify-change
description: Run the same checks CI runs (unit tests, typecheck, lint, build) on dupli1-manage-web and pick the matching browser test. Use before saying a change is done, before committing, or when asked to "verify", "check CI", or "make sure it passes".
---

# Verify a manage-web change

CI (`.github/workflows/ci.yml`) runs these in order and fails on any error. Run them in the same order and stop at the first failure.

```bash
npm test             # vitest run
npm run typecheck    # react-router typegen + tsc
npm run lint         # errors fail CI, warnings do not
npm run build        # only when routes, config or SSR code changed
```

## Pick a browser test when the change touches a covered surface

Browser tests drive a real browser against `npm run mock:gateway`; they are not in CI, so run the one that matches. `CHROMIUM_PATH` overrides the browser (this cloud image has Chromium at `/opt/pw-browsers/chromium`).

| You changed | Run |
|---|---|
| orders list, live feed, header bell | `npm run test:orders:browser` |
| support inbox / product questions | `npm run test:support:browser` |
| image galleries, uploads | `npm run test:images:browser` |
| catalog overview | `npm run test:catalog:browser` |
| color masters / swatches | `npm run test:swatches:browser` |
| second color on SKUs | `npm run test:sku-color2:browser` |
| kill switches (`/settings`) | `npm run test:killswitches:browser` |
| banners | `npm run test:banners:browser` |
| referrals | `npm run test:referrals:browser` |
| inspection video | `npm run test:inspection-video:browser` |
| login / session / refresh | `npm run test:login:browser`, `npm run test:session` |

If a new surface has none of these, say so in the report instead of implying it was browser-tested.

## Report

State what ran and what did not. Do not write "all checks pass" for checks you skipped. If something fails, show the failing output and the cause; never skip, disable or loosen a test or lint rule to get green.
