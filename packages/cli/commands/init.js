//@ts-check
import fs from 'fs';
import kleur from 'kleur';
import path from 'path';
import prompts from 'prompts';
import {copyDirectory, isValidPackageName, templatePath} from '../utils.js';

const PACKAGE_MANAGER = 'pnpm@11.0.8';

/**
 * Scaffold a new pnpm monorepo that hosts Canvas Commons animation projects.
 *
 * @param {import('minimist').ParsedArgs} options - Parsed CLI arguments. The
 *   first positional is used as the workspace name when present.
 */
export default async function init(options) {
  prompts.override({
    name: options._[0],
    path: options.path,
  });

  const response = await prompts([
    {
      type: 'text',
      name: 'name',
      message: 'Workspace name',
      initial: 'my-workspace',
      validate: value =>
        isValidPackageName(value)
          ? true
          : 'Workspace name must be a valid npm package name.',
    },
    {
      type: 'text',
      name: 'path',
      message: 'Workspace path',
      initial: prev => path.normalize(prev.replace('@', '')),
      validate: value => {
        const dir = path.normalize(value.trim());
        if (!fs.existsSync(dir)) {
          return true;
        }
        if (!fs.lstatSync(dir).isDirectory()) {
          return `Workspace path "${dir}" must be a valid directory.`;
        }
        if (fs.readdirSync(dir).length > 0) {
          return dir === '.'
            ? 'Current directory must be empty.'
            : `Target directory "${dir}" must be empty.`;
        }
        return true;
      },
      format: value => path.resolve(value),
    },
  ]);

  if (!response.path) {
    console.log(kleur.red('× Scaffolding aborted by the user.\n'));
    return;
  }

  copyDirectory(templatePath('monorepo'), response.path);

  fs.writeFileSync(
    path.join(response.path, 'package.json'),
    JSON.stringify(
      {
        name: response.name,
        private: true,
        packageManager: PACKAGE_MANAGER,
        engines: {node: '>=20.19.0'},
        scripts: {
          preinstall: 'npx only-allow pnpm',
          build: 'pnpm -r run build',
        },
      },
      undefined,
      2,
    ) + '\n',
  );

  fs.writeFileSync(
    path.join(response.path, 'README.md'),
    `# ${response.name}

A [Canvas Commons](https://canvascommons.io/) monorepo. Each animation lives in
its own project under \`projects/\`.

## Getting started

\`\`\`bash
pnpm install
canvas-commons project
\`\`\`

Then start the editor for a project:

\`\`\`bash
pnpm --filter <project-name> dev
\`\`\`
`,
  );

  console.log(kleur.green('\n√ Workspace created. You can now run:'));
  if (response.path !== process.cwd()) {
    console.log(
      `  ${kleur.bold('cd')} ${path.relative(process.cwd(), response.path)}`,
    );
  }
  console.log(`  ${kleur.bold('pnpm')} install`);
  console.log(`  ${kleur.bold('canvas-commons')} project`);
  console.log();
}
