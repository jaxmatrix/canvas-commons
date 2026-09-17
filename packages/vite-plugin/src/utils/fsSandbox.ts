import fs from 'fs';
import path from 'path';

export const IGNORED_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  'dist',
  'lib',
  'output',
  '.turbo',
  'coverage',
]);

export class FsSandboxError extends Error {
  public constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = 'FsSandboxError';
  }
}

/**
 * Resolve a project-relative path and ensure it stays inside `root`.
 */
export function resolveSandboxedPath(root: string, relativePath = ''): string {
  const normalizedRoot = path.resolve(root);
  const cleaned = relativePath.replace(/^[/\\]+/, '');
  const resolved = path.resolve(normalizedRoot, cleaned);
  const relative = path.relative(normalizedRoot, resolved);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new FsSandboxError('Path escapes project root', 403);
  }

  return resolved;
}

/**
 * Like {@link resolveSandboxedPath}, but also verifies the real path (after
 * symlinks) remains inside the project root when the target already exists.
 */
export async function resolveSandboxedRealPath(
  root: string,
  relativePath = '',
): Promise<string> {
  const resolved = resolveSandboxedPath(root, relativePath);
  const normalizedRoot = path.resolve(root);

  try {
    const realRoot = await fs.promises.realpath(normalizedRoot);
    const realPath = await fs.promises.realpath(resolved);
    const relative = path.relative(realRoot, realPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new FsSandboxError('Path escapes project root', 403);
    }
    return realPath;
  } catch (error) {
    if (
      error instanceof FsSandboxError ||
      (error as NodeJS.ErrnoException).code !== 'ENOENT'
    ) {
      throw error;
    }
    // Target does not exist yet (create/write). Verify parent stays inside root.
    const parent = path.dirname(resolved);
    try {
      const realRoot = await fs.promises.realpath(normalizedRoot);
      const realParent = await fs.promises.realpath(parent);
      const relative = path.relative(realRoot, realParent);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new FsSandboxError('Path escapes project root', 403);
      }
    } catch (parentError) {
      if (
        parentError instanceof FsSandboxError ||
        (parentError as NodeJS.ErrnoException).code !== 'ENOENT'
      ) {
        throw parentError;
      }
    }
    return resolved;
  }
}

export function toProjectRelative(root: string, absolutePath: string): string {
  const relative = path.relative(path.resolve(root), absolutePath);
  return relative.split(path.sep).join('/');
}

export function shouldIgnoreName(name: string): boolean {
  return IGNORED_DIR_NAMES.has(name) || name === '.' || name === '..';
}
