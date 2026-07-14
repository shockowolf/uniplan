import {
  MAX_SESSION_TTL_SECONDS,
  SESSION_COOKIE_NAME,
} from '@/lib/auth/session';

function shouldUseSecureCookies() {
  return process.env.NODE_ENV === 'production';
}

function baseCookieAttributes() {
  return [
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    ...(shouldUseSecureCookies() ? ['Secure'] : []),
  ];
}

export function createSessionCookie(
  token: string,
  expiresAt: Date,
  now = new Date(),
) {
  const remainingSeconds = Math.max(
    0,
    Math.floor((expiresAt.getTime() - now.getTime()) / 1_000),
  );
  const maxAge = Math.min(remainingSeconds, MAX_SESSION_TTL_SECONDS);
  return [
    `${SESSION_COOKIE_NAME}=${token}`,
    `Max-Age=${maxAge}`,
    `Expires=${expiresAt.toUTCString()}`,
    ...baseCookieAttributes(),
  ].join('; ');
}

export function clearSessionCookie() {
  return [
    `${SESSION_COOKIE_NAME}=`,
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    ...baseCookieAttributes(),
  ].join('; ');
}

export function readSessionCookie(request: Request) {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;

  const matchingValues = cookieHeader
    .split(';')
    .map((cookiePart) => cookiePart.trim())
    .filter((cookiePart) => cookiePart.startsWith(`${SESSION_COOKIE_NAME}=`))
    .map((cookiePart) => cookiePart.slice(SESSION_COOKIE_NAME.length + 1));

  return matchingValues.length === 1 && matchingValues[0]
    ? matchingValues[0]
    : null;
}
