import clsx from 'clsx';
import {useEffect} from 'preact/hooks';
import {Button} from '../controls';
import {EditorPane} from './EditorPane';
import {FileExplorer} from './FileExplorer';
import styles from './Ide.module.scss';
import {IdeProvider, useIde} from './IdeContext';
import {TerminalPane} from './TerminalPane';

export function IdeWorkspace() {
  return (
    <IdeProvider>
      <IdeWorkspaceInner />
    </IdeProvider>
  );
}

function IdeWorkspaceInner() {
  const {
    drawerOpen,
    activeTab,
    openFiles,
    activePath,
    setActivePath,
    closePath,
    saveActive,
    status,
  } = useIde();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        if (activeTab.value === 'files') {
          event.preventDefault();
          void saveActive();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTab, saveActive]);

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.tabs}>
          <button
            type="button"
            className={clsx(
              styles.tab,
              activeTab.value === 'files' && styles.tabActive,
            )}
            onClick={() => {
              activeTab.value = 'files';
            }}
          >
            Files
          </button>
          <button
            type="button"
            className={clsx(
              styles.tab,
              activeTab.value === 'terminal' && styles.tabActive,
            )}
            onClick={() => {
              activeTab.value = 'terminal';
            }}
          >
            Terminal
          </button>
        </div>
        <div className={styles.headerActions}>
          {activeTab.value === 'files' && (
            <>
              <Button
                onClick={() => {
                  drawerOpen.value = !drawerOpen.value;
                }}
              >
                {drawerOpen.value ? 'Hide tree' : 'Show tree'}
              </Button>
              <Button main onClick={() => void saveActive()}>
                Save
              </Button>
            </>
          )}
          {status.value && (
            <span className={styles.status}>{status.value}</span>
          )}
        </div>
      </div>

      <div
        className={clsx(
          styles.filesLayout,
          activeTab.value !== 'files' && styles.hiddenPane,
        )}
      >
        {drawerOpen.value && (
          <aside className={styles.drawer}>
            <FileExplorer />
          </aside>
        )}
        <div className={styles.editorColumn}>
          <div className={styles.openTabs}>
            {openFiles.value.map(file => (
              <button
                key={file.path}
                type="button"
                className={clsx(
                  styles.openTab,
                  activePath.value === file.path && styles.openTabActive,
                )}
                onClick={() => setActivePath(file.path)}
              >
                <span>
                  {file.dirty ? '• ' : ''}
                  {file.path.split('/').pop()}
                </span>
                <span
                  className={styles.closeTab}
                  onClick={event => {
                    event.stopPropagation();
                    closePath(file.path);
                  }}
                >
                  ×
                </span>
              </button>
            ))}
          </div>
          <div className={styles.editorBody}>
            <EditorPane />
          </div>
        </div>
      </div>
      <div
        className={clsx(
          styles.terminalPaneWrap,
          activeTab.value !== 'terminal' && styles.hiddenPane,
        )}
      >
        <TerminalPane />
      </div>
    </div>
  );
}
