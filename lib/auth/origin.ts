function parseOrigin(value: string) {
  try {
    const parsedUrl = new URL(value);
    if (
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

function expectedRequestOrigin(request: Request) {
  const configuredOrigin = process.env.UNIPLAN_APP_ORIGIN?.trim();
  if (configuredOrigin) return parseOrigin(configuredOrigin);
  try {
    return new URL(request.url).origin;
  } catch {
    return null;
  }
}

export function isSameOriginRequest(request: Request) {
  const requestOrigin = request.headers.get('origin');
  const expectedOrigin = expectedRequestOrigin(request);
  return Boolean(
    requestOrigin &&
      expectedOrigin &&
      parseOrigin(requestOrigin) === expectedOrigin,
  );
}
