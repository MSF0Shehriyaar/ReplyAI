import type { NextConfig } from "next";
import fs from "node:fs";
import path from "node:path";

// Automatically load the single shared .env from web root
const sharedEnv = path.resolve(process.cwd(), "../.env");
if (fs.existsSync(sharedEnv) && typeof (process as any).loadEnvFile === "function") {
  (process as any).loadEnvFile(sharedEnv);
}

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
