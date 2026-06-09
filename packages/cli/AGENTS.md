# @canvas-commons/cli

A pnpm-first, TypeScript-only command line tool for working with Canvas Commons
as a _monorepo of animations_. Where [`@canvas-commons/create`](../create) drops
a single project into a folder, this tool scaffolds a workspace and then grows
projects and scenes inside it.

Three commands, exposed through the `canvas-commons` bin:

- `init [name]` — scaffold a new pnpm monorepo (`projects/*` workspace).
- `project [name]` — create a TypeScript animation project under `projects/`.
- `scene [name]` — create a scene and register it in a project's `project.ts`.

See the [root `AGENTS.md`](../../AGENTS.md) for repo-wide standards.

## Commands

```bash
# As a downstream user (after installing the package globally or with `pnpm dlx`)
canvas-commons init my-workspace
cd my-workspace && pnpm install
canvas-commons project my-animation
cd projects/my-animation
canvas-commons scene intro

# Local development against the CLI itself
node packages/cli/index.js init /tmp/demo-workspace
```

No build step. `index.js` is the published artifact directly. No test script.

## Where things live

```
index.js              Executable. Parses argv, dispatches to a command.
utils.js              Shared helpers (copy, version cloning, workspace lookup).
commands/init.js      Scaffolds the monorepo.
commands/project.js   Scaffolds a TypeScript project under projects/.
commands/scene.js     Scaffolds a scene and edits project.ts.
templates/monorepo/   Static files for `init` (gitignore, .npmrc, workspace).
templates/2d-ts/      The TypeScript project starter (copy of create's template).
templates/scene.tsx   The single-scene boilerplate.
```

Dependencies are `minimist` (arg parsing), `prompts` (interactive selectors),
and `kleur` (colors). The workspace `@canvas-commons/*` deps are dev-only; their
published versions are cloned into a new project's `package.json` at scaffold
time (see `cloneVersions` in `utils.js`).

## Traps

**Files under `templates/` are excluded from the repo's ESLint and Prettier.**
They ship as-is to downstream users, so formatting and lint rules don't apply.

**`templates/2d-ts/` is a copy of `create/template-2d-ts/`.** They can't share a
directory (each package only publishes its own `files`), so keep them in sync
when either the vite plugin's expectations or the starter scene change.

**The CLI runs with whatever Node the user has.** It's plain JS, ES modules, no
TypeScript build step. Avoid Node-version-specific syntax.

**`project` and `scene` only work inside a workspace.** `findWorkspaceRoot`
walks up for a `pnpm-workspace.yaml` registering `projects/*`; `scene` also
accepts being run from inside a project directory. If neither is found, the
command exits with guidance rather than guessing.

**`scene` rewrites `project.ts` by string manipulation**, not by parsing. It
appends the new `?scene` import after the last existing one and adds the scene's
identifier to the `scenes: [...]` array (normalizing it to a single line). If
you change the shape of the generated `project.ts`, re-check the regexes in
`registerScene`.

## pnpm is required

The scaffolded monorepo pins `packageManager: "pnpm@…"` and runs
`npx only-allow pnpm` on `preinstall`, so npm/yarn are rejected. All next-step
messaging the CLI prints assumes pnpm.

## Used in the wild

```bash
$ canvas-commons init my-workspace
> Workspace name: my-workspace
> Workspace path: my-workspace
$ cd my-workspace && pnpm install
$ canvas-commons project intro
> Project name: intro
> Add the FFmpeg renderer for video export? yes
$ cd projects/intro
$ canvas-commons scene opening
$ pnpm --filter intro dev
```
