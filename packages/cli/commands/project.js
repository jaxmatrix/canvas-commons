//@ts-check
import fs from 'fs';
import kleur from 'kleur';
import path from 'path';
import prompts from 'prompts';
import {
  cloneVersions,
  copyDirectory,
  createConfig,
  findWorkspaceRoot,
  isValidPackageName,
  PLUGINS,
  templatePath,
} from '../utils.js';

/**
 * Create a new TypeScript animation project inside the current monorepo.
 *
 * @param {import('minimist').ParsedArgs} options - Parsed CLI arguments. The
 *   first positional is used as the project name when present.
 */
export default async function project(options) {
  const root = findWorkspaceRoot(process.cwd());
  if (!root) {
    console.log(
      kleur.red(
        '× No Canvas Commons workspace found. Run this inside a workspace\n' +
          '  created with `canvas-commons init`.\n',
      ),
    );
    process.exitCode = 1;
    return;
  }

  prompts.override({name: options._[0], ffmpeg: options.ffmpeg});
  const response = await prompts([
    {
      type: 'text',
      name: 'name',
      message: 'Project name',
      initial: 'my-animation',
      validate: value => {
        if (!isValidPackageName(value)) {
          return 'Project name must be a valid npm package name.';
        }
        const dir = path.join(root, 'projects', value);
        if (fs.existsSync(dir) && fs.readdirSync(dir).length > 0) {
          return `Project "${value}" already exists.`;
        }
        return true;
      },
    },
    {
      type: 'confirm',
      name: 'ffmpeg',
      message: 'Add the FFmpeg renderer for video export?',
      initial: true,
    },
  ]);

  if (response.name === undefined || response.ffmpeg === undefined) {
    console.log(kleur.red('× Scaffolding aborted by the user.\n'));
    return;
  }

  const plugins = response.ffmpeg ? ['core', 'ffmpeg'] : ['core'];
  const dest = path.join(root, 'projects', response.name);

  copyDirectory(templatePath('2d-ts'), dest);
  createConfig(dest, plugins);

  const manifest = JSON.parse(
    fs.readFileSync(path.join(dest, 'package.json'), 'utf-8'),
  );
  manifest.name = response.name;
  manifest.dependencies ??= {};
  for (const plugin of plugins) {
    const data = PLUGINS[plugin];
    if (data.version) {
      manifest.dependencies[data.package] = data.version;
    }
  }
  cloneVersions(manifest.dependencies);
  if (manifest.devDependencies) {
    cloneVersions(manifest.devDependencies);
  }
  fs.writeFileSync(
    path.join(dest, 'package.json'),
    JSON.stringify(manifest, undefined, 2) + '\n',
  );

  console.log(kleur.green('\n√ Project created. You can now run:'));
  console.log(`  ${kleur.bold('pnpm')} install`);
  console.log(`  ${kleur.bold('pnpm')} --filter ${response.name} dev`);
  console.log(
    `\nAdd more scenes with ${kleur.bold(
      `canvas-commons scene`,
    )} from inside the project.\n`,
  );
}
