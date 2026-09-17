import clsx from 'clsx';
import {useEffect, useState} from 'preact/hooks';
import {FsTreeEntry} from '../../utils/projectFs';
import {Button} from '../controls';
import styles from './Ide.module.scss';
import {useIde} from './IdeContext';

export function FileExplorer() {
  const {
    tree,
    treeError,
    refreshTree,
    openPath,
    activePath,
    createFile,
    createDirectory,
    removePath,
    renamePath,
    uploadDroppedFiles,
  } = useIde();
  const [dropActive, setDropActive] = useState(false);

  useEffect(() => {
    void refreshTree();
  }, []);

  const root = tree.value;

  const onDrop = async (event: DragEvent) => {
    event.preventDefault();
    setDropActive(false);
    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) {
      return;
    }
    await uploadDroppedFiles('', files);
  };

  return (
    <div
      className={clsx(styles.explorer, dropActive && styles.dropActive)}
      onDragOver={event => {
        event.preventDefault();
        setDropActive(true);
      }}
      onDragLeave={() => setDropActive(false)}
      onDrop={onDrop}
    >
      <div className={styles.explorerToolbar}>
        <Button title="Refresh" onClick={() => void refreshTree()}>
          Refresh
        </Button>
        <Button
          title="New file"
          onClick={() => {
            const name = window.prompt('New file name');
            if (name) {
              void createFile('', name);
            }
          }}
        >
          New file
        </Button>
        <Button
          title="New folder"
          onClick={() => {
            const name = window.prompt('New folder name');
            if (name) {
              void createDirectory('', name);
            }
          }}
        >
          New folder
        </Button>
      </div>
      {treeError.value && <div className={styles.error}>{treeError.value}</div>}
      <div className={styles.tree}>
        {root?.children?.map(entry => (
          <TreeNode
            key={entry.path || entry.name}
            entry={entry}
            depth={0}
            activePath={activePath.value}
            onOpen={path => void openPath(path)}
            onDelete={path => {
              if (window.confirm(`Delete ${path}?`)) {
                void removePath(path);
              }
            }}
            onRename={path => {
              const next = window.prompt('Rename to', path);
              if (next && next !== path) {
                void renamePath(path, next);
              }
            }}
            onNewFile={directory => {
              const name = window.prompt('New file name');
              if (name) {
                void createFile(directory, name);
              }
            }}
            onNewFolder={directory => {
              const name = window.prompt('New folder name');
              if (name) {
                void createDirectory(directory, name);
              }
            }}
            onUpload={async (directory, files) => {
              await uploadDroppedFiles(directory, files);
            }}
          />
        ))}
      </div>
    </div>
  );
}

interface TreeNodeProps {
  entry: FsTreeEntry;
  depth: number;
  activePath: string | null;
  onOpen: (path: string) => void;
  onDelete: (path: string) => void;
  onRename: (path: string) => void;
  onNewFile: (directory: string) => void;
  onNewFolder: (directory: string) => void;
  onUpload: (directory: string, files: FileList) => Promise<void>;
}

function TreeNode({
  entry,
  depth,
  activePath,
  onOpen,
  onDelete,
  onRename,
  onNewFile,
  onNewFolder,
  onUpload,
}: TreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 1);

  if (entry.type === 'directory') {
    return (
      <div>
        <div
          className={clsx(styles.entry, styles.directory)}
          // eslint-disable-next-line @typescript-eslint/naming-convention
          style={{'--depth': depth} as never}
          onClick={() => setExpanded(value => !value)}
          onContextMenu={event => {
            event.preventDefault();
            const action = window.prompt(
              'Action: new file / new folder / rename / delete',
              'new file',
            );
            if (!action) {
              return;
            }
            const normalized = action.toLowerCase();
            if (normalized.startsWith('new file')) {
              onNewFile(entry.path);
            } else if (normalized.startsWith('new folder')) {
              onNewFolder(entry.path);
            } else if (normalized.startsWith('rename')) {
              onRename(entry.path);
            } else if (normalized.startsWith('delete')) {
              onDelete(entry.path);
            }
          }}
          onDragOver={event => event.preventDefault()}
          onDrop={event => {
            event.preventDefault();
            event.stopPropagation();
            const files = event.dataTransfer?.files;
            if (files && files.length > 0) {
              void onUpload(entry.path, files);
            }
          }}
        >
          <span className={styles.twisty}>{expanded ? '▾' : '▸'}</span>
          <span className={styles.entryLabel}>{entry.name}</span>
        </div>
        {expanded &&
          entry.children?.map(child => (
            <TreeNode
              key={child.path || child.name}
              entry={child}
              depth={depth + 1}
              activePath={activePath}
              onOpen={onOpen}
              onDelete={onDelete}
              onRename={onRename}
              onNewFile={onNewFile}
              onNewFolder={onNewFolder}
              onUpload={onUpload}
            />
          ))}
      </div>
    );
  }

  return (
    <div
      className={clsx(
        styles.entry,
        styles.file,
        activePath === entry.path && styles.active,
      )}
      // eslint-disable-next-line @typescript-eslint/naming-convention
      style={{'--depth': depth} as never}
      onClick={() => onOpen(entry.path)}
      onContextMenu={event => {
        event.preventDefault();
        const action = window.prompt('Action: rename / delete', 'rename');
        if (!action) {
          return;
        }
        const normalized = action.toLowerCase();
        if (normalized.startsWith('rename')) {
          onRename(entry.path);
        } else if (normalized.startsWith('delete')) {
          onDelete(entry.path);
        }
      }}
    >
      <span className={styles.entryLabel}>{entry.name}</span>
    </div>
  );
}
