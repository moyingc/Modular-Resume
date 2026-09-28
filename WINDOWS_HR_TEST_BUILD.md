# Windows HR Test Build

This branch packages the verified V1 Next.js application in an Electron desktop shell for an unsigned Windows x64 HR/Co-op evaluation build.

## Deliberately excluded
- Gmail OAuth / Gmail cloud Draft creation (disabled in the packaged runtime)
- Outlook integration
- automatic email sending
- updater / telemetry / production code signing

Email composition and “Open Local Email Client” remain available.

## Build
```bash
npm install
npm run dist:win
```

Expected output:
`dist-windows/Modular-Resume-HR-Test-0.1.0-Setup.exe`

The installer is intentionally unsigned, so Windows SmartScreen may show an Unknown Publisher warning.
