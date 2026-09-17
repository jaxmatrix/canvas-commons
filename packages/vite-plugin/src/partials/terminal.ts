import type {IncomingMessage} from 'http';
import type {Duplex} from 'stream';
import type {Plugin, ResolvedConfig} from 'vite';
import {WebSocketServer, type WebSocket} from 'ws';

const TERMINAL_PATH = '/__canvas-commons-terminal';

interface PtyProcess {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
  onData(callback: (data: string) => void): void;
  onExit(callback: (event: {exitCode: number}) => void): void;
}

interface PtyModule {
  spawn(
    file: string,
    args: string[],
    options: {
      name?: string;
      cols?: number;
      rows?: number;
      cwd?: string;
      env?: NodeJS.ProcessEnv;
    },
  ): PtyProcess;
}

type ClientMessage =
  | {type: 'open'; id?: string; cols?: number; rows?: number}
  | {type: 'input'; id?: string; data: string}
  | {type: 'resize'; id?: string; cols: number; rows: number}
  | {type: 'close'; id?: string};

type ServerMessage =
  | {type: 'data'; id?: string; data: string}
  | {type: 'exit'; id?: string; exitCode: number; error?: string};

type TerminalSession = {
  pty: PtyProcess;
  id: string;
};

export function terminalPlugin(): Plugin {
  let config: ResolvedConfig;
  const sessions = new Map<WebSocket, TerminalSession>();
  let ptyModule: PtyModule | null | undefined;

  return {
    name: 'canvas-commons:terminal',

    configResolved(resolvedConfig) {
      config = resolvedConfig;
    },

    configureServer(server) {
      const wss = new WebSocketServer({noServer: true});

      const loadPty = async (): Promise<PtyModule | null> => {
        if (ptyModule !== undefined) {
          return ptyModule;
        }
        try {
          ptyModule = (await import('node-pty')) as unknown as PtyModule;
          return ptyModule;
        } catch {
          ptyModule = null;
          return null;
        }
      };

      const send = (socket: WebSocket, message: ServerMessage) => {
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify(message));
        }
      };

      const endSession = (socket: WebSocket) => {
        const session = sessions.get(socket);
        if (session) {
          session.pty.kill();
          sessions.delete(socket);
        }
      };

      const handleOpen = async (
        socket: WebSocket,
        message: Extract<ClientMessage, {type: 'open'}>,
      ) => {
        endSession(socket);

        const id = message.id ?? 'default';
        const pty = await loadPty();
        if (!pty) {
          send(socket, {
            type: 'exit',
            id,
            exitCode: 1,
            error:
              'node-pty is not available. Install native build tools and add node-pty to use the IDE terminal.',
          });
          return;
        }

        const shell = resolveShell();
        const cols = message.cols ?? 80;
        const rows = message.rows ?? 24;
        const ptyProcess = pty.spawn(shell.file, shell.args, {
          name: 'xterm-color',
          cols,
          rows,
          cwd: config.root,
          env: buildEnv(),
        });

        sessions.set(socket, {pty: ptyProcess, id});

        ptyProcess.onData(data => {
          send(socket, {type: 'data', id, data});
        });

        ptyProcess.onExit(({exitCode}) => {
          sessions.delete(socket);
          send(socket, {type: 'exit', id, exitCode});
        });
      };

      wss.on('connection', socket => {
        socket.on('message', raw => {
          let message: ClientMessage;
          try {
            message = JSON.parse(String(raw)) as ClientMessage;
          } catch {
            return;
          }

          switch (message.type) {
            case 'open':
              void handleOpen(socket, message);
              break;
            case 'input': {
              const session = sessions.get(socket);
              if (session && typeof message.data === 'string') {
                session.pty.write(message.data);
              }
              break;
            }
            case 'resize': {
              const session = sessions.get(socket);
              if (
                session &&
                Number.isFinite(message.cols) &&
                Number.isFinite(message.rows)
              ) {
                session.pty.resize(
                  Math.max(1, Math.floor(message.cols)),
                  Math.max(1, Math.floor(message.rows)),
                );
              }
              break;
            }
            case 'close':
              endSession(socket);
              break;
          }
        });

        socket.on('close', () => {
          endSession(socket);
        });

        socket.on('error', () => {
          endSession(socket);
        });
      });

      const onUpgrade = (
        req: IncomingMessage,
        socket: Duplex,
        head: Buffer,
      ) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        if (url.pathname !== TERMINAL_PATH) {
          return;
        }
        wss.handleUpgrade(req, socket, head, ws => {
          wss.emit('connection', ws, req);
        });
      };

      server.httpServer?.on('upgrade', onUpgrade);

      server.httpServer?.on('close', () => {
        server.httpServer?.off('upgrade', onUpgrade);
        for (const session of sessions.values()) {
          session.pty.kill();
        }
        sessions.clear();
        wss.close();
      });
    },
  };
}

function resolveShell(): {file: string; args: string[]} {
  if (process.platform === 'win32') {
    return {
      file: process.env.COMSPEC ?? 'powershell.exe',
      args: [],
    };
  }
  const shell = process.env.SHELL ?? '/bin/bash';
  return {file: shell, args: []};
}

function buildEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    TERM: 'xterm-256color',
    // eslint-disable-next-line @typescript-eslint/naming-convention
    COLORTERM: 'truecolor',
  };
}
