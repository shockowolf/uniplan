function parseOrigin(value: string) {
  try {
    const parsedUrl = new URL(value);
    if (
      !['http:', 'https:'].includes(parsedUrl.protocol) ||
      parsedUrl.username ||
      parsedUrl.password ||
      parsedUrl.pathname !== '/' ||
      parsedUrl.search ||
      parsedUrl.hash
    ) {
      return null;
    }
    return parsedUrl.origin;
  } catch {
    return null;
  }
}

function localhostRequestOrigin(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    if (
      !['localhost', '127.0.0.1', '[::1]'].includes(requestUrl.hostname) ||
      !['http:', 'https:'].includes(requestUrl.protocol)
    ) {
      return null;
    }
    return requestUrl.origin;
  } catch {
    return null;
  }
}

export function expectedRequestOrigin(
  request: Request,
  environment: NodeJS.ProcessEnv = process.env,
) {
  const configuredOrigin = environment.UNIPLAN_APP_ORIGIN?.trim();
  const isProduction = environment.NODE_ENV === 'production';

  if (configuredOrigin) {
    const parsedOrigin = parseOrigin(configuredOrigin);
    if (!parsedOrigin) return null;
    if (isProduction && !parsedOrigin.startsWith('https://')) return null;
    return parsedOrigin;
  }

  // Development and tests may use only the loopback origin in request.url.
  // Production never derives trust from request or proxy host headers.
  return isProduction ? null : localhostRequestOrigin(request);
}

export function isSameOriginRequest(
  request: Request,
  environment: NodeJS.ProcessEnv = process.env,
) {
  const requestOrigin = request.headers.get('origin');
  const expectedOrigin = expectedRequestOrigin(request, environment);
  return Boolean(
    requestOrigin &&
      expectedOrigin &&
      parseOrigin(requestOrigin) === expectedOrigin,
  );
}
