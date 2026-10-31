declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    CREDENTIALS_KEY?: string;
    BUCKET?: R2Bucket;
  }
}
