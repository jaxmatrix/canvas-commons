const PREFIX = '/__canvas-commons-fs';

export interface FsTreeEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  mtime?: number;
  children?: FsTreeEntry[];
}

export interface FsReadResult {
  path: string;
  encoding: 'utf8' | 'base64';
  content: string;
}

async function request<T>(
  route: string,
  init?: RequestInit & {query?: Record<string, string>},
): Promise<T> {
  const url = new URL(`${PREFIX}${route}`, window.location.origin);
  if (init?.query) {
    for (const [key, value] of Object.entries(init.query)) {
      url.searchParams.set(key, value);
    }
  }
  const {query: _query, ...fetchInit} = init ?? {};
  const response = await fetch(url.pathname + url.search, {
    ...fetchInit,
    headers: {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      'Content-Type': 'application/json',
      ...(fetchInit.headers ?? {}),
    },
  });
  const data = (await response.json()) as T & {error?: string};
  if (!response.ok) {
    throw new Error(
      data.error ?? `Filesystem request failed (${response.status})`,
    );
  }
  return data;
}

export function fetchTree(path = '', depth = 2): Promise<FsTreeEntry> {
  return request<FsTreeEntry>('/tree', {
    query: {path, depth: String(depth)},
  });
}

export function readTextFile(path: string): Promise<FsReadResult> {
  return request<FsReadResult>('/read', {
    query: {path, encoding: 'utf8'},
  });
}

export function writeTextFile(
  path: string,
  content: string,
): Promise<{path: string}> {
  return request('/write', {
    method: 'PUT',
    body: JSON.stringify({path, content, encoding: 'utf8'}),
  });
}

export function mkdir(path: string): Promise<{path: string}> {
  return request('/mkdir', {
    method: 'POST',
    body: JSON.stringify({path}),
  });
}

export function deleteEntry(path: string): Promise<{ok: boolean}> {
  return request('/entry', {
    method: 'DELETE',
    query: {path},
  });
}

export function renameEntry(
  from: string,
  to: string,
): Promise<{from: string; to: string}> {
  return request('/rename', {
    method: 'POST',
    body: JSON.stringify({from, to}),
  });
}

export async function uploadFile(
  directory: string,
  file: File,
): Promise<{path: string}> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  const content = btoa(binary);
  return request('/upload', {
    method: 'POST',
    body: JSON.stringify({
      path: directory,
      name: file.name,
      content,
      encoding: 'base64',
    }),
  });
}

export function projectAssetUrl(relativePath: string): string {
  const cleaned = relativePath.replace(/^[/\\]+/, '');
  return `/${cleaned.split('\\').join('/')}`;
}

const TEXT_EXTENSIONS = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'json',
  'md',
  'mdx',
  'txt',
  'css',
  'scss',
  'sass',
  'less',
  'html',
  'htm',
  'svg',
  'xml',
  'yml',
  'yaml',
  'toml',
  'meta',
  'env',
  'sh',
  'bash',
  'zsh',
  'gitignore',
  'npmrc',
  'editorconfig',
]);

const IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'ico',
  'avif',
]);

const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'ogg', 'mov', 'mkv']);

export type PreviewKind = 'text' | 'image' | 'video' | 'unsupported';

export function previewKindForPath(filePath: string): PreviewKind {
  const base = filePath.split(/[/\\]/).pop() ?? filePath;
  if (base.startsWith('.') && !base.includes('.', 1)) {
    return 'text';
  }
  const ext = base.includes('.')
    ? base.slice(base.lastIndexOf('.') + 1).toLowerCase()
    : '';
  if (!ext || TEXT_EXTENSIONS.has(ext)) {
    return 'text';
  }
  if (IMAGE_EXTENSIONS.has(ext)) {
    return 'image';
  }
  if (VIDEO_EXTENSIONS.has(ext)) {
    return 'video';
  }
  // SVG is listed as text for editing; also allow image preview via extension above if removed
  return 'unsupported';
}
