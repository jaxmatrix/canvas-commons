import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands';
import {css} from '@codemirror/lang-css';
import {html} from '@codemirror/lang-html';
import {javascript} from '@codemirror/lang-javascript';
import {json} from '@codemirror/lang-json';
import {markdown} from '@codemirror/lang-markdown';
import {EditorState} from '@codemirror/state';
import {EditorView, keymap, lineNumbers} from '@codemirror/view';
import {tokyoNightInit} from '@uiw/codemirror-theme-tokyo-night';
import {basicSetup} from 'codemirror';
import {useEffect, useRef} from 'preact/hooks';
import {projectAssetUrl} from '../../utils/projectFs';
import styles from './Ide.module.scss';
import {useIde} from './IdeContext';

/* eslint-disable @typescript-eslint/naming-convention -- CodeMirror theme selectors */
const editorLayoutTheme = EditorView.theme({
  '&': {
    height: '100%',
  },
  '.cm-scroller': {
    overflow: 'auto',
  },
  '.cm-editor': {
    height: '100%',
  },
});
/* eslint-enable @typescript-eslint/naming-convention */

const TOKYO_NIGHT_THEME = tokyoNightInit({
  settings: {
    fontFamily: 'var(--font-family-mono)',
  },
});

export function EditorPane() {
  const {openFiles, activePath, updateContent, saveActive} = useIde();
  const active = openFiles.value.find(file => file.path === activePath.value);

  if (!active) {
    return (
      <div className={styles.emptyPane}>
        Open a file from the explorer to edit or preview it.
      </div>
    );
  }

  if (active.kind === 'image') {
    return (
      <div className={styles.mediaPane}>
        <img src={projectAssetUrl(active.path)} alt={active.path} />
      </div>
    );
  }

  if (active.kind === 'video') {
    return (
      <div className={styles.mediaPane}>
        <video src={projectAssetUrl(active.path)} controls />
      </div>
    );
  }

  if (active.kind === 'unsupported') {
    return (
      <div className={styles.emptyPane}>
        <p>Cannot preview this file type in the IDE.</p>
        <a href={`/__open-in-editor?file=${encodeURIComponent(active.path)}`}>
          Open in external editor
        </a>
      </div>
    );
  }

  return (
    <CodeEditor
      key={active.path}
      path={active.path}
      value={active.content}
      onChange={content => updateContent(active.path, content)}
      onSave={() => void saveActive()}
    />
  );
}

interface CodeEditorProps {
  path: string;
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
}

function CodeEditor({path, value, onChange, onSave}: CodeEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  onChangeRef.current = onChange;
  onSaveRef.current = onSave;

  useEffect(() => {
    if (!hostRef.current) {
      return;
    }

    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          lineNumbers(),
          history(),
          languageForPath(path),
          keymap.of([
            ...defaultKeymap,
            ...historyKeymap,
            indentWithTab,
            {
              key: 'Mod-s',
              run: () => {
                onSaveRef.current();
                return true;
              },
            },
          ]),
          TOKYO_NIGHT_THEME,
          editorLayoutTheme,
          EditorView.updateListener.of(update => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
        ],
      }),
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [path]);

  return <div className={styles.codeHost} ref={hostRef} />;
}

function languageForPath(path: string) {
  const lower = path.toLowerCase();
  if (lower.endsWith('.json') || lower.endsWith('.meta')) {
    return json();
  }
  if (lower.endsWith('.md') || lower.endsWith('.mdx')) {
    return markdown();
  }
  if (lower.endsWith('.css') || lower.endsWith('.scss')) {
    return css();
  }
  if (lower.endsWith('.html') || lower.endsWith('.htm')) {
    return html();
  }
  return javascript({typescript: true, jsx: true});
}
