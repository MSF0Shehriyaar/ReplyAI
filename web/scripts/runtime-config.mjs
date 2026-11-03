export function assertSessionRuntime(env=process.env) {
  if((env.SESSION_SIGNING_KEY||'').trim().length<32)throw new Error('SESSION_SIGNING_KEY is required: set at least 32 cryptographically random characters in the hosting service environment, then restart.');
}
