# @canvas-commons/cli

A pnpm-first command line tool for working with [Canvas Commons][canvas-commons]
as a **monorepo of animations**. Scaffold a workspace once, then grow TypeScript
projects and scenes inside it.

> **pnpm is required.** The workspace this tool creates pins pnpm as its package
> manager and rejects npm/yarn on install. Make sure you have
> [pnpm installed](https://pnpm.io/installation) first.

## Installation

You don't have to install anything to try it — run it on demand with `pnpm dlx`:

```bash
pnpm dlx @canvas-commons/cli init my-workspace
```

Or install it globally so the `canvas-commons` command is always available:

```bash
pnpm add -g @canvas-commons/cli
canvas-commons init my-workspace
```

## Commands

```
canvas-commons <command> [name]

  init [name]      Scaffold a new pnpm monorepo for animations
  project [name]   Create a TypeScript project inside the monorepo
  scene [name]     Create a scene and register it in a project

  -h, --help       Show this help
  -v, --version    Show the version
```

Each command prompts for anything it needs; pass the name as an argument to skip
the prompt.

### `init` — create the workspace

```bash
canvas-commons init my-workspace
cd my-workspace
pnpm install
```

This produces a pnpm monorepo whose animation projects live under `projects/`:

```
my-workspace/
├── package.json          # private, pnpm-only
├── pnpm-workspace.yaml   # packages: ['projects/*']
├── .npmrc
├── .gitignore
└── projects/
```

### `project` — add an animation project

Run from anywhere inside the workspace:

```bash
canvas-commons project intro
```

It creates a TypeScript project at `projects/intro` (preconfigured with the
Canvas Commons vite plugin, an example scene, and optionally the FFmpeg video
renderer), then run it with:

```bash
pnpm install
pnpm --filter intro dev
```

### `scene` — add a scene

Run from inside a project (or from the workspace root, where it asks which
project to target):

```bash
cd projects/intro
canvas-commons scene opening-title
```

This creates `src/scenes/opening-title.tsx` and registers it in the project's
`src/project.ts` automatically:

```ts
import openingTitle from './scenes/opening-title?scene';

export default makeProject({
  scenes: [example, openingTitle],
});
```

## Typical flow

```bash
canvas-commons init my-workspace
cd my-workspace && pnpm install
canvas-commons project intro
cd projects/intro
canvas-commons scene opening-title
pnpm --filter intro dev
```

[canvas-commons]: https://canvascommons.io/
