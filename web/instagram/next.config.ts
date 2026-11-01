import type { NextConfig } from "next";
import fs from "node:fs";
import path from "node:path";

// Automatically load the single shared .env from web root
const sharedEnv = path.resolve(process.cwd(), "../.env");
if (fs.existsSync(sharedEnv) && typeof (process as any).loadEnvFile === "function") {
  (process as any).loadEnvFile(sharedEnv);
}

const nextConfig: NextConfig = {
  async headers() {
    return [
      {source:'/:path*',headers:[{key:'Referrer-Policy',value:'no-referrer'},{key:'X-Robots-Tag',value:'noindex, nofollow, noarchive'}]},
      {source:'/whatsapp/:path*',headers:[{key:'Referrer-Policy',value:'no-referrer'},{key:'X-Robots-Tag',value:'noindex, nofollow, noarchive'},{key:'Cache-Control',value:'private, no-store'}]},
      {source:'/api/whatsapp-service/:path*',headers:[{key:'Referrer-Policy',value:'no-referrer'},{key:'Cache-Control',value:'private, no-store'}]},
    ];
  },
};

export default nextConfig;
