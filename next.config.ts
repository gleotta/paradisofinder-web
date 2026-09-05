import type { NextConfig } from "next";

/**
 * Deploy (docs/DEPLOY_RAILWAY.md):
 *  - `output: "standalone"`: el Dockerfile copia solo `.next/standalone` +
 *    `.next/static` + `public` y arranca con `node server.js`.
 *  - Headers de seguridad estáticos acá; la Content-Security-Policy con nonce
 *    por request vive en `src/proxy.ts` (necesita render dinámico, que ya es
 *    el caso: el layout hace `await connection()`).
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  // Railway termina TLS con certificado propio: forzar HTTPS 2 años (sin preload).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
