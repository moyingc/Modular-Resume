# Modular Resume V1 Production Trim

This is the trimmed V1 production baseline. It keeps the runtime features required by the current product and removes historical migration notes, obsolete patch scripts, superseded test fixtures, unsupported Outlook integration, generated caches, and unused starter assets.

## Runtime scope
- Personal Career Library and modular resume editing
- JD analysis, targeting and recommendation
- Professional Summary V2
- Page-limit/layout planning
- ATS validation and PDF export
- Cover Letter and short application email composition
- JD application-email detection and CC
- Gmail Draft integration using Desktop OAuth + PKCE
- Local draft/revision storage and deleted-module recovery

## Retained release gates
- TypeScript typecheck
- ESLint
- Critical closure regression tests
- UI acceptance regression
- Security gate
- Release secret/token sanitizer

Gmail integration creates drafts only. The application does not contain a direct email-send route.
