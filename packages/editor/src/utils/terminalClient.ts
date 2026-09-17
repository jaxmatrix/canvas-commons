export interface TerminalClientOptions {
  id?: string;
  onData: (data: string) => void;
  onExit: (payload: {exitCode: number; error?: string}) => void;
}

type ClientMessage =
  | {type: 'open'; id?: string; cols?: number; rows?: number}
  | {type: 'input'; id?: string; data: string}
  | {type: 'resize'; id?: string; cols: number; rows: number}
  | {type: 'close'; id?: string};

type ServerMessage =
  | {type: 'data'; id?: string; data: string}
  | {type: 'exit'; id?: string; exitCode: number; error?: string};

export class TerminalClient {
  private readonly id: string;
  private readonly onData: TerminalClientOptions['onData'];
  private readonly onExit: TerminalClientOptions['onExit'];
  private socket: WebSocket | null = null;
  private opened = false;
  private exited = true;

  public constructor(options: TerminalClientOptions) {
    this.id = options.id ?? 'default';
    this.onData = options.onData;
    this.onExit = options.onExit;
  }

  public get isAlive(): boolean {
    return (
      this.opened &&
      !this.exited &&
      this.socket !== null &&
      this.socket.readyState === WebSocket.OPEN
    );
  }

  public get hasExited(): boolean {
    return this.exited;
  }

  /**
   * Open a PTY session only when none is running.
   * Returns false if an existing live session was kept.
   */
  public ensureOpen(cols: number, rows: number): boolean {
    if (this.isAlive) {
      this.resize(cols, rows);
      return false;
    }
    this.open(cols, rows);
    return true;
  }

  public open(cols: number, rows: number) {
    this.teardownSocket(false);
    this.exited = false;

    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(
      `${protocol}://${location.host}/__canvas-commons-terminal`,
    );
    this.socket = socket;

    socket.addEventListener('open', () => {
      if (this.socket !== socket) {
        return;
      }
      this.opened = true;
      this.send({
        type: 'open',
        id: this.id,
        cols,
        rows,
      });
    });

    socket.addEventListener('message', event => {
      if (this.socket !== socket) {
        return;
      }

      let message: ServerMessage;
      try {
        message = JSON.parse(String(event.data)) as ServerMessage;
      } catch {
        return;
      }

      if (message.id !== undefined && message.id !== this.id) {
        return;
      }

      if (message.type === 'data') {
        this.onData(message.data);
        return;
      }

      if (message.type === 'exit') {
        this.opened = false;
        this.exited = true;
        this.onExit({
          exitCode: message.exitCode,
          error: message.error,
        });
      }
    });

    socket.addEventListener('error', () => {
      if (this.socket !== socket) {
        return;
      }
      if (!this.exited) {
        this.exited = true;
        this.opened = false;
        this.onExit({
          exitCode: 1,
          error: 'Failed to connect to the IDE terminal WebSocket.',
        });
      }
    });

    socket.addEventListener('close', () => {
      if (this.socket !== socket) {
        return;
      }
      this.opened = false;
      if (!this.exited) {
        this.exited = true;
        this.onExit({
          exitCode: 1,
          error: 'IDE terminal connection closed.',
        });
      }
    });
  }

  public write(data: string) {
    this.send({type: 'input', id: this.id, data});
  }

  public resize(cols: number, rows: number) {
    this.send({type: 'resize', id: this.id, cols, rows});
  }

  public close() {
    this.teardownSocket(true);
  }

  private teardownSocket(notifyServer: boolean) {
    this.exited = true;
    if (this.socket) {
      if (notifyServer && this.opened) {
        this.send({type: 'close', id: this.id});
      }
      this.socket.close();
      this.socket = null;
    }
    this.opened = false;
  }

  private send(message: ClientMessage) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    this.socket.send(JSON.stringify(message));
  }
}
