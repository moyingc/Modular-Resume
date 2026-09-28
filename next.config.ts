import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV !== 'production';
const scriptSrc = isDevelopment ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self' 'unsafe-inline'";

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Content-Security-Policy', value: `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; ${scriptSrc}; connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com https://openidconnect.googleapis.com https://gmail.googleapis.com;` },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

export default nextConfig;
