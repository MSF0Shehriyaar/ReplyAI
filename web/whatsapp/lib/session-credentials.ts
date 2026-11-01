export function hasSessionCredentials(request:Request) {
  const cookie=request.headers.get('cookie') || '';
  return /(?:^|;\s*)(?:wa_session|nina_owner_session)=[^;\s]+/.test(cookie) || /^Bearer\s+\S+/.test(request.headers.get('authorization') || '');
}
