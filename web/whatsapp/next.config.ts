import fs from 'node:fs';
import path from 'node:path';

// Automatically load the single shared .env from web root
const sharedEnv = path.resolve(process.cwd(), '../.env');
if (fs.existsSync(sharedEnv) && typeof (process as any).loadEnvFile === 'function') {
  (process as any).loadEnvFile(sharedEnv);
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath:'/business',
  reactStrictMode: true,
  async redirects() {
    return [{source:'/',destination:'/business',basePath:false,permanent:false}];
  },
  serverExternalPackages: [
    '@whiskeysockets/baileys',
    'qrcode',
  ],
  async rewrites() {
    return [
      {
        source: '/whatsapp',
        destination: '/',
      },
      {
        source: '/api/whatsapp/workspace',
        destination: '/api/workspace',
      },
      {
        source: '/api/whatsapp/connect',
        destination: '/api/connect',
      },
      {
        source: '/api/whatsapp/:path*',
        destination: '/api/:path*',
      },
    ];
  },
};

export default nextConfig;
