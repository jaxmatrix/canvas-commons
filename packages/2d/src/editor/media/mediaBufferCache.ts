const ORIGINAL_BY_BUFFER_URL = new Map<string, string>();
const BUFFER_BY_ORIGINAL_URL = new Map<
  string,
  {url: string; hash: string; updatedAt: number}
>();

export function registerMediaBuffer(
  originalUrl: string,
  bufferUrl: string,
  hash: string,
): void {
  const previous = BUFFER_BY_ORIGINAL_URL.get(originalUrl);
  if (previous) {
    URL.revokeObjectURL(previous.url);
    ORIGINAL_BY_BUFFER_URL.delete(previous.url);
  }

  BUFFER_BY_ORIGINAL_URL.set(originalUrl, {
    url: bufferUrl,
    hash,
    updatedAt: Date.now(),
  });
  ORIGINAL_BY_BUFFER_URL.set(bufferUrl, originalUrl);
}

export function getMediaBuffer(originalUrl: string) {
  return BUFFER_BY_ORIGINAL_URL.get(originalUrl) ?? null;
}

export function listMediaBuffers(): Array<{
  originalUrl: string;
  url: string;
  hash: string;
  updatedAt: number;
}> {
  return [...BUFFER_BY_ORIGINAL_URL.entries()].map(([originalUrl, buffer]) => ({
    originalUrl,
    url: buffer.url,
    hash: buffer.hash,
    updatedAt: buffer.updatedAt,
  }));
}

export function resolveOriginalMediaUrl(url: string): string {
  return ORIGINAL_BY_BUFFER_URL.get(url) ?? url;
}

export function hashMediaEditSettings(value: unknown): string {
  return JSON.stringify(value);
}
