export const MAX_LOGIN_BODY_BYTES = 4 * 1_024;

export type BoundedLoginBodyResult =
  | { status: 'ok'; value: unknown }
  | { status: 'invalid' }
  | { status: 'too_large' };

function declaredBodyIsTooLarge(request: Request) {
  const contentLength = request.headers.get('content-length')?.trim();
  if (!contentLength || !/^\d+$/.test(contentLength)) return false;
  return Number(contentLength) > MAX_LOGIN_BODY_BYTES;
}

export async function readBoundedLoginJson(
  request: Request,
): Promise<BoundedLoginBodyResult> {
  if (declaredBodyIsTooLarge(request)) return { status: 'too_large' };
  if (!request.body) return { status: 'invalid' };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_LOGIN_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        return { status: 'too_large' };
      }
      chunks.push(value);
    }

    const bodyBytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bodyBytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const bodyText = new TextDecoder('utf-8', { fatal: true }).decode(bodyBytes);
    return { status: 'ok', value: JSON.parse(bodyText) as unknown };
  } catch {
    return { status: 'invalid' };
  } finally {
    reader.releaseLock();
  }
}
