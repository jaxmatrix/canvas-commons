#!/usr/bin/env node
//@ts-check
import kleur from 'kleur';
import minimist from 'minimist';
import init from './commands/init.js';
import project from './commands/project.js';
import scene from './commands/scene.js';
import {MANIFEST} from './utils.js';

const COMMANDS = {init, project, scene};

const HELP = `${kleur.bold('canvas-commons')} <command> [name]

Commands:
  ${kleur.cyan('init')} [name]      Scaffold a new pnpm monorepo for animations
  ${kleur.cyan('project')} [name]   Create a TypeScript project inside the monorepo
  ${kleur.cyan('scene')} [name]     Create a scene and register it in a project

Options:
  -h, --help       Show this help
  -v, --version    Show the version
`;

(async () => {
  const options = minimist(process.argv.slice(2));
  const command = options._.shift();

  if (options.version || options.v) {
    console.log(MANIFEST.version);
    return;
  }

  if (!command || options.help || options.h) {
    console.log(HELP);
    return;
  }

  const handler = COMMANDS[command];
  if (!handler) {
    console.log(kleur.red(`× Unknown command "${command}".\n`));
    console.log(HELP);
    process.exitCode = 1;
    return;
  }

  await handler(options);
})();
