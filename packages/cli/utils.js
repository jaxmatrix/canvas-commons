//@ts-check
import fs from 'fs';
import {fileURLToPath} from 'node:url';
import path from 'path';

const FILES_TO_MODIFY = {
  gitignore: '.gitignore',
  '.gitkeep': false,
};

export const MANIFEST = JSON.parse(
  fs.readFileSync(
    path.resolve(fileURLToPath(import.meta.url), '../package.json'),
    'utf-8',
  ),
);

export const PLUGINS = {
  core: {
    package: '@canvas-commons/vite-plugin',
    variable: 'canvasCommons',
    options: () => '',
  },
  ffmpeg: {
    package: '@canvas-commons/ffmpeg',
    variable: 'ffmpeg',
    version: '*',
  },
};

export function templatePath(...segments) {
  return path.resolve(
    fileURLToPath(import.meta.url),
    '..',
    'templates',
    ...segments,
  );
}

export function isValidPackageName(name) {
  return /^(?:@[a-z0-9-*~][a-z0-9-*._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(
    name,
  );
}

export function copyDirectory(src, dest) {
  fs.mkdirSync(dest, {recursive: true});
  for (const file of fs.readdirSync(src)) {
    let target = file;
    if (file in FILES_TO_MODIFY) {
      if (FILES_TO_MODIFY[file] === false) continue;
      target = FILES_TO_MODIFY[file];
    }
    const srcFile = path.resolve(src, file);
    const destFile = path.resolve(dest, target);
    copy(srcFile, destFile);
  }
}

function copy(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    copyDirectory(src, dest);
  } else {
    fs.copyFileSync(src, dest);
  }
}

export function createConfig(dir, plugins) {
  const imports = [];
  const entries = [];
  for (const plugin of plugins) {
    const data = PLUGINS[plugin];
    imports.push(`import ${data.variable} from '${data.package}';\n`);
    entries.push(`${data.variable}(${data.options?.() ?? ''}),`);
  }

  fs.writeFileSync(
    path.resolve(dir, 'vite.config.ts'),
    `import {defineConfig} from 'vite';
${imports.join('')}
export default defineConfig({
  plugins: [
    ${entries.join('\n    ')}
  ],
});
`,
  );
}

export function getPackageManager() {
  const ua = process.env.npm_config_user_agent;
  return ua?.split(' ')[0].split('/')[0] ?? 'npm';
}

export function cloneVersions(versions) {
  for (const dependency in versions) {
    if (dependency.startsWith('@canvas-commons')) {
      versions[dependency] = resolveVersion(
        MANIFEST.devDependencies[dependency],
      );
    }
  }
}

/**
 * Turn a CLI dependency specifier into one a standalone project can install.
 *
 * Published builds carry concrete ranges (e.g. `^0.3.1`). When running from
 * source the specifiers are still `workspace:`/`link:` protocols, which only
 * resolve inside this repo; fall back to the CLI's own version, which tracks the
 * other `@canvas-commons/*` packages via the changeset fixed group.
 *
 * @param {string | undefined} version - The specifier from the CLI's manifest.
 * @returns {string} An installable semver range.
 */
function resolveVersion(version) {
  if (
    !version ||
    version.startsWith('workspace:') ||
    version.startsWith('link:')
  ) {
    return `^${MANIFEST.version}`;
  }
  return version;
}

/**
 * Walk up from `start` looking for a Canvas Commons monorepo root, identified by
 * a `pnpm-workspace.yaml` that registers the `projects/*` workspace.
 *
 * @param {string} start - Directory to begin the search from.
 * @returns {string | null} The workspace root, or `null` when not inside one.
 */
export function findWorkspaceRoot(start) {
  let dir = path.resolve(start);
  while (true) {
    const workspaceFile = path.join(dir, 'pnpm-workspace.yaml');
    if (fs.existsSync(workspaceFile)) {
      const contents = fs.readFileSync(workspaceFile, 'utf-8');
      if (/projects\/\*/.test(contents)) {
        return dir;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Convert a kebab-case, snake_case, or spaced name into a camelCase identifier
 * suitable for use as a JavaScript variable.
 *
 * @param {string} name - The human-friendly name.
 * @returns {string} A camelCase identifier.
 */
export function toIdentifier(name) {
  const identifier = name
    .replace(/[^a-zA-Z0-9]+(.)?/g, (_, chr) => (chr ? chr.toUpperCase() : ''))
    .replace(/^[A-Z]/, chr => chr.toLowerCase());
  return /^[0-9]/.test(identifier) ? `scene${identifier}` : identifier;
}
