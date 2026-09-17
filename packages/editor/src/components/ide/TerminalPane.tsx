import {FitAddon} from '@xterm/addon-fit';
import {Terminal} from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import {useEffect, useRef, useState} from 'preact/hooks';
import {TerminalClient} from '../../utils/terminalClient';
import styles from './Ide.module.scss';
import {useIde} from './IdeContext';

function readCssColor(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

export function TerminalPane() {
  const {activeTab} = useIde();
  const tab = activeTab.value;
  const hostRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const clientRef = useRef<TerminalClient | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hostRef.current || terminalRef.current) {
      return;
    }

    const background = readCssColor('--background-color-dark', '#141414');
    const theme = readCssColor('--theme', '#33a6ff');
    const themeLight = readCssColor('--theme-light', '#52bbff');
    const red = readCssColor('--red', '#e13238');
    const yellow = readCssColor('--yellow', '#e6a700');
    const blue = readCssColor('--blue', '#4cb3d4');
    const fontFamily =
      getComputedStyle(document.documentElement)
        .getPropertyValue('--font-family-mono-nerd')
        .trim() || "'JetBrainsMono Nerd Font', 'JetBrains Mono', monospace";

    const terminal = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontFamily,
      fontSize: 13,
      theme: {
        background,
        foreground: 'rgba(255, 255, 255, 0.87)',
        cursor: theme,
        cursorAccent: background,
        selectionBackground: 'rgba(51, 166, 255, 0.32)',
        selectionForeground: '#ffffff',
        black: '#141414',
        red,
        green: '#7ece7e',
        yellow,
        blue,
        magenta: '#c792ea',
        cyan: themeLight,
        white: '#e0e0e0',
        brightBlack: '#444444',
        brightRed: red,
        brightGreen: '#9ce09c',
        brightYellow: '#f0c040',
        brightBlue: theme,
        brightMagenta: '#d7a6ff',
        brightCyan: themeLight,
        brightWhite: '#ffffff',
      },
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(hostRef.current);
    fitAddon.fit();

    const client = new TerminalClient({
      onData: data => terminal.write(data),
      onExit: payload => {
        if (payload.error) {
          setError(payload.error);
          terminal.writeln(`\r\n[${payload.error}]`);
          return;
        }

        setError(null);
        terminal.writeln(`\r\n[process exited with code ${payload.exitCode}]`);
        // Spawn a fresh shell only after a clean PTY exit (not connection errors).
        window.setTimeout(() => {
          if (!clientRef.current || clientRef.current.isAlive) {
            return;
          }
          fitAddon.fit();
          client.ensureOpen(terminal.cols, terminal.rows);
          terminal.focus();
        }, 50);
      },
    });

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    clientRef.current = client;

    client.ensureOpen(terminal.cols, terminal.rows);

    const dataDisposable = terminal.onData(data => {
      if (client.isAlive) {
        client.write(data);
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      if (!hostRef.current || hostRef.current.offsetParent === null) {
        return;
      }
      fitAddon.fit();
      if (client.isAlive) {
        client.resize(terminal.cols, terminal.rows);
      }
    });
    resizeObserver.observe(hostRef.current);

    return () => {
      dataDisposable.dispose();
      resizeObserver.disconnect();
      client.close();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      clientRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (tab !== 'terminal') {
      return;
    }

    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    const client = clientRef.current;
    if (!terminal || !fitAddon || !client) {
      return;
    }

    // After display:none → visible, xterm needs a fit + focus pass.
    requestAnimationFrame(() => {
      fitAddon.fit();
      if (client.hasExited || !client.isAlive) {
        client.ensureOpen(terminal.cols, terminal.rows);
      } else {
        client.resize(terminal.cols, terminal.rows);
      }
      terminal.focus();
    });
  }, [tab]);

  return (
    <div className={styles.terminalPane}>
      {error && <div className={styles.error}>{error}</div>}
      <div className={styles.terminalHost} ref={hostRef} />
    </div>
  );
}
