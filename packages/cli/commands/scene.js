//@ts-check
import fs from 'fs';
import kleur from 'kleur';
import path from 'path';
import prompts from 'prompts';
import {findWorkspaceRoot, templatePath, toIdentifier} from '../utils.js';

/**
 * Create a new scene inside a project and register it in `project.ts`.
 *
 * @param {import('minimist').ParsedArgs} options - Parsed CLI arguments. The
 *   first positional is used as the scene name when present.
 */
export default async function scene(options) {
  const projectDir = await resolveProject();
  if (!projectDir) return;

  prompts.override({name: options._[0]});
  const response = await prompts({
    type: 'text',
    name: 'name',
    message: 'Scene name',
    initial: 'my-scene',
    validate: value => {
      if (!/^[a-z0-9-]+$/.test(value)) {
        return 'Scene name must be lowercase letters, numbers, and dashes.';
      }
      if (
        fs.existsSync(path.join(projectDir, 'src', 'scenes', `${value}.tsx`))
      ) {
        return `Scene "${value}" already exists.`;
      }
      return true;
    },
  });

  if (!response.name) {
    console.log(kleur.red('× Scaffolding aborted by the user.\n'));
    return;
  }

  const name = response.name;
  const scenesDir = path.join(projectDir, 'src', 'scenes');
  fs.mkdirSync(scenesDir, {recursive: true});
  fs.copyFileSync(
    templatePath('scene.tsx'),
    path.join(scenesDir, `${name}.tsx`),
  );

  registerScene(path.join(projectDir, 'src', 'project.ts'), name);

  console.log(
    kleur.green(
      `\n√ Created scene "${name}" and registered it in project.ts.\n`,
    ),
  );
}

async function resolveProject() {
  const detected = detectProject(process.cwd());
  if (detected) return detected;

  const root = findWorkspaceRoot(process.cwd());
  if (!root) {
    console.log(
      kleur.red(
        '× No project found. Run this inside a project, or inside a\n' +
          '  workspace created with `canvas-commons init`.\n',
      ),
    );
    process.exitCode = 1;
    return null;
  }

  const projectsDir = path.join(root, 'projects');
  const projects = fs.existsSync(projectsDir)
    ? fs
        .readdirSync(projectsDir)
        .filter(name =>
          fs.existsSync(path.join(projectsDir, name, 'src', 'project.ts')),
        )
    : [];

  if (projects.length === 0) {
    console.log(
      kleur.red(
        '× No projects found. Create one first with `canvas-commons project`.\n',
      ),
    );
    process.exitCode = 1;
    return null;
  }

  if (projects.length === 1) {
    return path.join(projectsDir, projects[0]);
  }

  const {project} = await prompts({
    type: 'select',
    name: 'project',
    message: 'Which project should the scene be added to?',
    choices: projects.map(name => ({title: name, value: name})),
  });

  return project ? path.join(projectsDir, project) : null;
}

/**
 * Walk up from `start` looking for the nearest directory holding a
 * `src/project.ts` file.
 *
 * @param {string} start - Directory to begin the search from.
 * @returns {string | null} The project root, or `null` when not inside one.
 */
function detectProject(start) {
  let dir = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(dir, 'src', 'project.ts'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Add a scene import and register it in the `scenes` array of a `project.ts`.
 */
function registerScene(projectFile, name) {
  const ident = toIdentifier(name);
  let content = fs.readFileSync(projectFile, 'utf-8');
  const importLine = `import ${ident} from './scenes/${name}?scene';`;

  const sceneImportRegex = /import .+ from '\.\/scenes\/.+\?scene';/g;
  let match;
  let last = null;
  while ((match = sceneImportRegex.exec(content)) !== null) {
    last = match;
  }
  if (last) {
    const index = last.index + last[0].length;
    content = `${content.slice(0, index)}\n${importLine}${content.slice(index)}`;
  } else {
    content = content.replace(/^(import .+;\n)/m, `$1\n${importLine}\n`);
  }

  content = content.replace(/scenes:\s*\[([\s\S]*?)\]/, (_, inner) => {
    const items = inner
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
    items.push(ident);
    return `scenes: [${items.join(', ')}]`;
  });

  fs.writeFileSync(projectFile, content);
}
