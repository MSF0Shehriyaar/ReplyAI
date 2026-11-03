export class SessionConfigurationError extends Error {
  readonly code='AUTH_CONFIGURATION_UNAVAILABLE';
  constructor(){super('Owner sign-in is temporarily unavailable. Session security must be configured by the administrator.');this.name='SessionConfigurationError';}
}
export function sessionSigningSecret():string {
  const secret=process.env.SESSION_SIGNING_KEY||'';
  if(secret.trim().length<32)throw new SessionConfigurationError();
  return secret;
}
