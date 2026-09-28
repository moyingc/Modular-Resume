# Modular Resume V1 — Security Assessment & Hardening Report

Date: 2026-09-14
Scope: V1 Freeze source package supplied for local testing.

## Executive status

This pass is an **internal security assessment and hardening pass**, not an independent third-party certification. Static review, threat modeling, adversarial review, security regression checks, release-secret scanning, type checking, linting, closure tests, and UI acceptance regression were performed. Several concrete weaknesses were found and hardened without changing product features.

The build is suitable for continued controlled/local testing. It should **not** be represented as independently penetration-tested, externally certified, or production-security validated.

## Threat model (STRIDE-oriented)

### Assets
- Resume/career data stored in browser local storage.
- OAuth access/refresh tokens stored under the OS user's home directory.
- Gmail/Outlook draft-creation capability.
- Imported resume/template files.
- Generated PDF/application content.

### Trust boundaries
- Browser UI ↔ local Next.js API routes.
- Local API ↔ Google/Microsoft OAuth and mail APIs.
- User-selected local files ↔ browser parsers (DOCX/PDF/JSON/Markdown).
- Project/release package ↔ local runtime credential store.

### Primary threats reviewed
- Spoofing/login-CSRF around OAuth state.
- Cross-site request forgery against draft/disconnect endpoints.
- Header injection in RFC822 mail construction.
- XSS from imported or JD-controlled text.
- SSRF through server-side fetches.
- Path traversal and local secret leakage.
- Oversized request/attachment denial of service.
- Malicious PDF/DOCX parser dependencies.
- Clickjacking/MIME sniffing/browser policy weaknesses.
- Accidental release of OAuth credentials or tokens.

## Findings fixed in this pass

### 1. RFC822 header injection risk — fixed
Recipient, CC, subject, MIME type and attachment filename were not sufficiently protected against CR/LF control characters before RFC822 construction. The draft route now validates header values, validates basic email syntax, and the mail builder strips CR/LF/NUL controls as defense in depth.

### 2. Disconnect CSRF/origin validation gap — fixed
The draft endpoint had an origin check, but disconnect did not. Disconnect now requires a same-origin browser request.

### 3. Draft payload / attachment memory DoS — mitigated
The draft API now rejects oversized declared request bodies and enforces per-attachment and total attachment base64 limits. This reduces memory-exhaustion risk from the local HTTP surface.

### 4. Browser hardening headers — added
The application now emits CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, and Permissions-Policy headers. The previous LAN development origin allowlist was removed from the release configuration.

### 5. OAuth runtime directory permissions — hardened
Token files were already written as 0600. The runtime credential directory is now explicitly created/chmodded as 0700 as an additional OS-user isolation boundary.

## XSS / CSRF / SSRF / path traversal / malicious-file review

- No `dangerouslySetInnerHTML`, `eval`, or `new Function` usage was found in app/source code by the security gate.
- React-rendered user strings therefore use React's normal text escaping path.
- Mail draft and disconnect state-changing routes now enforce same-origin browser requests.
- OAuth uses cryptographically random state; Google uses PKCE S256.
- Server-side network destinations are fixed Google/Microsoft endpoints except developer-owned local OAuth configuration values. No user/JD-controlled arbitrary fetch target was identified.
- OAuth token storage is outside the project tree; release sanitizer checks for token/secret leakage.
- DOCX import uses `mammoth` 1.12.2; the known directory-traversal advisory affecting mammoth <1.11.0 is not applicable to the pinned version.
- `pdfjs-dist` is 4.10.38. It is newer than the 4.2.67 patch for CVE-2024-4367 and is outside the affected >=5.6.83,<6.2.108 range of CVE-2026-16633.
- Imported local files remain a parser attack surface. File size limits are not uniformly enforced across every browser-side resume/template import path; this remains a defense-in-depth improvement for a later security-only pass if the product accepts untrusted third-party files at scale.

## Dependency review

Pinned top-level versions reviewed:
- next 16.3.4
- react/react-dom 19.2.8
- mammoth 1.12.2
- pdfjs-dist 4.10.38
- pdf-lib 1.17.1

React 19.2.8 contains the patch for the July 2026 React Server Functions DoS advisory affecting <19.2.8. Next.js 16.3.4 is newer than the patch levels for several 16.0–16.2 advisories reviewed in the GitHub Advisory Database.

A live `npm audit --package-lock-only` was attempted, but the execution environment could not resolve `registry.npmjs.org` (`EAI_AGAIN`). Therefore a complete current transitive dependency advisory closure **cannot be claimed from this environment**. Before public distribution, rerun `npm audit`/Dependabot or equivalent in a network-enabled environment and review all runtime findings.

## Tests executed

- TypeScript `tsc --noEmit`: PASS.
- ESLint: PASS with 2 pre-existing non-security warnings, 0 errors.
- Closure test suite: PASS.
- UI acceptance regression: PASS.
- Release sanitizer: PASS.
- Security regression gate: PASS, 18/18 checks.
- `npm audit --package-lock-only`: attempted, BLOCKED by registry DNS/network unavailability.
- Production `next build`: attempted, BLOCKED because Next.js attempted to download the Linux SWC package and the environment could not reach npm registry.

## Security regression gate coverage

The added `npm run test:security` checks:
- no `dangerouslySetInnerHTML`;
- no `eval` / `new Function` in app source;
- no direct mail-send API route;
- same-origin enforcement on draft/disconnect;
- request and attachment size limits;
- recipient/header validation;
- OAuth cryptographic state and Google PKCE S256;
- 0600 token files and 0700 runtime directory;
- RFC822 control-character stripping;
- CSP/clickjacking/MIME-sniffing headers;
- no LAN `allowedDevOrigins` in release configuration.

## Red-team / penetration-test status

An internal adversarial source review was performed against the local attack surface and produced the fixes above. This is **not equivalent to a professional external penetration test**. A real penetration test requires a runnable deployed target, network observation, dynamic scanners/manual exploitation, and an independent tester or separate security environment.

## Multi-user / hostile-network status

The current product architecture is local/single-user oriented. A true multi-user load/adversarial-network test was not possible here because there is no deployed multi-user service target and this environment cannot complete the production build. The security pass did remove the explicit LAN dev-origin allowlist and tightened same-origin API boundaries to keep V1 aligned with local-only operation.

## Third-party independent audit status

No third-party security organization has audited this software. An AI/internal review cannot truthfully substitute for an independent external audit or certification.

## Remaining security risks

1. OAuth tokens are OS-user isolated (0600/0700) but are still plaintext files rather than macOS Keychain/Windows Credential Manager entries.
2. Microsoft OAuth remains less runtime-validated than the Google path.
3. Full live transitive dependency audit must be rerun with registry access.
4. Browser-side import paths should receive explicit file-size/complexity limits before accepting arbitrary untrusted files at scale.
5. Public deployment would require a separate production threat model because the current assumptions are local/single-user.

## Release statement

Accurate statement for external communication:

> Modular Resume V1 has undergone an internal security hardening and regression pass covering OAuth state/PKCE handling, local credential isolation, release-secret scanning, CSRF/origin controls, mail-header injection defenses, request-size limits, browser security headers, and targeted dependency advisory review. It has not undergone an independent third-party penetration test or production-scale security certification.
