import fs from 'fs';
import type {IncomingMessage, ServerResponse} from 'http';
import path from 'path';
import type {Connect, Plugin, ResolvedConfig} from 'vite';
import {
  FsSandboxError,
  resolveSandboxedRealPath,
  shouldIgnoreName,
  toProjectRelative,
} from '../utils/fsSandbox';

const PREFIX = '/__canvas-commons-fs';

export interface FsTreeEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  mtime?: number;
  children?: FsTreeEntry[];
}

export function fsPlugin(): Plugin {
  let config: ResolvedConfig;

  return {
    name: 'canvas-commons:fs',

    configResolved(resolvedConfig) {
      config = resolvedConfig;
    },

    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith(PREFIX)) {
          next();
          return;
        }

        try {
          await handleFsRequest(req, res, config.root);
        } catch (error) {
          if (error instanceof FsSandboxError) {
            sendJson(res, error.status, {error: error.message});
            return;
          }
          const message =
            error instanceof Error ? error.message : 'Unknown filesystem error';
          sendJson(res, 500, {error: message});
        }
      });
    },
  };
}

async function handleFsRequest(
  req: Connect.IncomingMessage,
  res: ServerResponse,
  root: string,
) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const route = url.pathname.slice(PREFIX.length) || '/';
  const relativePath = url.searchParams.get('path') ?? '';

  if (req.method === 'GET' && route === '/tree') {
    const depth = Number(url.searchParams.get('depth') ?? '1');
    const tree = await listTree(
      root,
      relativePath,
      Number.isFinite(depth) ? depth : 1,
    );
    sendJson(res, 200, tree);
    return;
  }

  if (req.method === 'GET' && route === '/read') {
    const absolute = await resolveSandboxedRealPath(root, relativePath);
    const stat = await fs.promises.stat(absolute);
    if (!stat.isFile()) {
      throw new FsSandboxError('Not a file', 400);
    }
    const encoding = (url.searchParams.get('encoding') ??
      'utf8') as BufferEncoding;
    if (encoding === 'base64') {
      const buffer = await fs.promises.readFile(absolute);
      sendJson(res, 200, {
        path: toProjectRelative(root, absolute),
        encoding: 'base64',
        content: buffer.toString('base64'),
      });
      return;
    }
    const content = await fs.promises.readFile(absolute, 'utf8');
    sendJson(res, 200, {
      path: toProjectRelative(root, absolute),
      encoding: 'utf8',
      content,
    });
    return;
  }

  if (req.method === 'PUT' && route === '/write') {
    const body = await readJson<{
      path?: string;
      content?: string;
      encoding?: string;
    }>(req);
    const target = body.path ?? relativePath;
    if (typeof body.content !== 'string') {
      throw new FsSandboxError('Missing content');
    }
    const absolute = await resolveSandboxedRealPath(root, target);
    await fs.promises.mkdir(path.dirname(absolute), {recursive: true});
    if (body.encoding === 'base64') {
      await fs.promises.writeFile(
        absolute,
        Buffer.from(body.content, 'base64'),
      );
    } else {
      await fs.promises.writeFile(absolute, body.content, 'utf8');
    }
    sendJson(res, 200, {path: toProjectRelative(root, absolute)});
    return;
  }

  if (req.method === 'POST' && route === '/mkdir') {
    const body = await readJson<{path?: string}>(req);
    const target = body.path ?? relativePath;
    const absolute = await resolveSandboxedRealPath(root, target);
    await fs.promises.mkdir(absolute, {recursive: true});
    sendJson(res, 200, {path: toProjectRelative(root, absolute)});
    return;
  }

  if (req.method === 'DELETE' && route === '/entry') {
    const absolute = await resolveSandboxedRealPath(root, relativePath);
    const resolvedRoot = path.resolve(root);
    if (path.resolve(absolute) === resolvedRoot) {
      throw new FsSandboxError('Cannot delete project root', 403);
    }
    await fs.promises.rm(absolute, {recursive: true, force: true});
    sendJson(res, 200, {ok: true});
    return;
  }

  if (req.method === 'POST' && route === '/rename') {
    const body = await readJson<{from?: string; to?: string}>(req);
    if (!body.from || !body.to) {
      throw new FsSandboxError('Missing from/to');
    }
    const fromAbs = await resolveSandboxedRealPath(root, body.from);
    const toAbs = await resolveSandboxedRealPath(root, body.to);
    await fs.promises.mkdir(path.dirname(toAbs), {recursive: true});
    await fs.promises.rename(fromAbs, toAbs);
    sendJson(res, 200, {
      from: toProjectRelative(root, fromAbs),
      to: toProjectRelative(root, toAbs),
    });
    return;
  }

  if (req.method === 'POST' && route === '/upload') {
    const body = await readJson<{
      path?: string;
      name?: string;
      content?: string;
      encoding?: string;
    }>(req);
    if (!body.name || typeof body.content !== 'string') {
      throw new FsSandboxError('Missing name/content');
    }
    const directory = body.path ?? relativePath;
    const targetRelative = path.posix.join(
      directory.replace(/\\/g, '/').replace(/^\/+/, ''),
      body.name,
    );
    const absolute = await resolveSandboxedRealPath(root, targetRelative);
    await fs.promises.mkdir(path.dirname(absolute), {recursive: true});
    if (body.encoding === 'base64') {
      await fs.promises.writeFile(
        absolute,
        Buffer.from(body.content, 'base64'),
      );
    } else {
      await fs.promises.writeFile(absolute, body.content, 'utf8');
    }
    sendJson(res, 200, {path: toProjectRelative(root, absolute)});
    return;
  }

  sendJson(res, 404, {error: 'Not found'});
}

async function listTree(
  root: string,
  relativePath: string,
  depth: number,
): Promise<FsTreeEntry> {
  const absolute = await resolveSandboxedRealPath(root, relativePath);
  const stat = await fs.promises.stat(absolute);
  const entryPath = toProjectRelative(root, absolute);
  const name = entryPath === '' ? path.basename(root) : path.basename(absolute);

  if (!stat.isDirectory()) {
    return {
      name,
      path: entryPath,
      type: 'file',
      size: stat.size,
      mtime: stat.mtimeMs,
    };
  }

  const children: FsTreeEntry[] = [];
  if (depth > 0) {
    const names = await fs.promises.readdir(absolute);
    names.sort((a, b) => a.localeCompare(b));
    for (const childName of names) {
      if (shouldIgnoreName(childName)) {
        continue;
      }
      const childAbsolute = path.join(absolute, childName);
      let childStat: fs.Stats;
      try {
        childStat = await fs.promises.stat(childAbsolute);
      } catch {
        continue;
      }
      const childRelative = toProjectRelative(root, childAbsolute);
      if (childStat.isDirectory()) {
        children.push(await listTree(root, childRelative, depth - 1));
      } else {
        children.push({
          name: childName,
          path: childRelative,
          type: 'file',
          size: childStat.size,
          mtime: childStat.mtimeMs,
        });
      }
    }
  }

  return {
    name,
    path: entryPath,
    type: 'directory',
    mtime: stat.mtimeMs,
    children,
  };
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) {
    return {} as T;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new FsSandboxError('Invalid JSON body');
  }
}
