# V1 Production Trim Report

## Removed
- Historical V8/V9/RC/freeze reports and benchmark documents
- One-time Python patch/migration scripts
- Generated TypeScript build cache
- Unused default Next.js public SVG assets
- Superseded integration tests already covered by retained critical regression tests
- Unconfigured Microsoft/Outlook OAuth routes and provider implementation
- Microsoft Graph/login CSP endpoints

## Retained
- All current V1 resume editing, importing, targeting, Summary V2, ATS, PDF, application-composer, Gmail Draft, local storage and settings runtime code
- Gmail OAuth + PKCE and local token isolation
- Critical regression, UI acceptance, security, and release sanitizer gates
- SECURITY_AUDIT_V1.md and production README

## Product boundary
The V1 production baseline supports Gmail Draft integration only. Outlook was removed because it was not configured or runtime-validated in V1.
