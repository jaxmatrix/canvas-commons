import path from 'path';
import {describe, expect, it} from 'vitest';
import {
  FsSandboxError,
  resolveSandboxedPath,
  shouldIgnoreName,
  toProjectRelative,
} from './fsSandbox';

describe('resolveSandboxedPath', () => {
  const root = path.resolve('/tmp/project');

  it('resolves relative paths inside the root', () => {
    expect(resolveSandboxedPath(root, 'src/scene.tsx')).toBe(
      path.resolve(root, 'src/scene.tsx'),
    );
  });

  it('rejects path traversal', () => {
    expect(() => resolveSandboxedPath(root, '../outside')).toThrow(
      FsSandboxError,
    );
  });

  it('treats leading slashes as project-relative', () => {
    expect(resolveSandboxedPath(root, '/src/scene.tsx')).toBe(
      path.resolve(root, 'src/scene.tsx'),
    );
  });

  it('rejects nested traversal segments', () => {
    expect(() => resolveSandboxedPath(root, 'src/../../outside')).toThrow(
      FsSandboxError,
    );
  });

  it('treats empty path as the root', () => {
    expect(resolveSandboxedPath(root, '')).toBe(path.resolve(root));
  });
});

describe('toProjectRelative', () => {
  it('returns posix-style relative paths', () => {
    const root = path.resolve('/tmp/project');
    const absolute = path.resolve(root, 'src', 'a.tsx');
    expect(toProjectRelative(root, absolute)).toBe('src/a.tsx');
  });
});

describe('shouldIgnoreName', () => {
  it('ignores common noise directories', () => {
    expect(shouldIgnoreName('node_modules')).toBe(true);
    expect(shouldIgnoreName('.git')).toBe(true);
    expect(shouldIgnoreName('src')).toBe(false);
  });
});
