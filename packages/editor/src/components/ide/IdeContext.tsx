import {useSignal} from '@preact/signals';
import {ComponentChildren, createContext} from 'preact';
import {useContext} from 'preact/hooks';
import {
  deleteEntry,
  fetchTree,
  FsTreeEntry,
  mkdir,
  PreviewKind,
  previewKindForPath,
  readTextFile,
  renameEntry,
  uploadFile,
  writeTextFile,
} from '../../utils/projectFs';

export type IdeTab = 'files' | 'terminal';

export interface OpenFile {
  path: string;
  kind: PreviewKind;
  content: string;
  dirty: boolean;
}

interface IdeContextValue {
  tree: ReturnType<typeof useSignal<FsTreeEntry | null>>;
  treeError: ReturnType<typeof useSignal<string | null>>;
  drawerOpen: ReturnType<typeof useSignal<boolean>>;
  activeTab: ReturnType<typeof useSignal<IdeTab>>;
  openFiles: ReturnType<typeof useSignal<OpenFile[]>>;
  activePath: ReturnType<typeof useSignal<string | null>>;
  status: ReturnType<typeof useSignal<string | null>>;
  refreshTree: (path?: string) => Promise<void>;
  openPath: (path: string) => Promise<void>;
  closePath: (path: string) => void;
  setActivePath: (path: string | null) => void;
  updateContent: (path: string, content: string) => void;
  saveActive: () => Promise<void>;
  createFile: (directory: string, name: string) => Promise<void>;
  createDirectory: (directory: string, name: string) => Promise<void>;
  removePath: (path: string) => Promise<void>;
  renamePath: (from: string, to: string) => Promise<void>;
  uploadDroppedFiles: (
    directory: string,
    files: FileList | File[],
  ) => Promise<void>;
}

const IdeContext = createContext<IdeContextValue | null>(null);

export function useIde(): IdeContextValue {
  const value = useContext(IdeContext);
  if (!value) {
    throw new Error('useIde must be used within IdeProvider');
  }
  return value;
}

export function IdeProvider({children}: {children: ComponentChildren}) {
  const tree = useSignal<FsTreeEntry | null>(null);
  const treeError = useSignal<string | null>(null);
  const drawerOpen = useSignal(true);
  const activeTab = useSignal<IdeTab>('files');
  const openFiles = useSignal<OpenFile[]>([]);
  const activePath = useSignal<string | null>(null);
  const status = useSignal<string | null>(null);

  const refreshTree = async (path = '') => {
    try {
      tree.value = await fetchTree(path, 3);
      treeError.value = null;
    } catch (error) {
      treeError.value =
        error instanceof Error ? error.message : 'Failed to load file tree';
    }
  };

  const openPath = async (path: string) => {
    const kind = previewKindForPath(path);
    const existing = openFiles.value.find(file => file.path === path);
    if (existing) {
      activePath.value = path;
      activeTab.value = 'files';
      return;
    }

    let content = '';
    if (kind === 'text') {
      const result = await readTextFile(path);
      content = result.content;
    }

    openFiles.value = [...openFiles.value, {path, kind, content, dirty: false}];
    activePath.value = path;
    activeTab.value = 'files';
  };

  const closePath = (path: string) => {
    const next = openFiles.value.filter(file => file.path !== path);
    openFiles.value = next;
    if (activePath.value === path) {
      activePath.value = next.at(-1)?.path ?? null;
    }
  };

  const setActivePath = (path: string | null) => {
    activePath.value = path;
    if (path) {
      activeTab.value = 'files';
    }
  };

  const updateContent = (path: string, content: string) => {
    openFiles.value = openFiles.value.map(file =>
      file.path === path ? {...file, content, dirty: true} : file,
    );
  };

  const saveActive = async () => {
    const path = activePath.value;
    if (!path) {
      return;
    }
    const file = openFiles.value.find(entry => entry.path === path);
    if (!file || file.kind !== 'text' || !file.dirty) {
      return;
    }
    status.value = 'Saving…';
    try {
      await writeTextFile(path, file.content);
      openFiles.value = openFiles.value.map(entry =>
        entry.path === path ? {...entry, dirty: false} : entry,
      );
      status.value = 'Saved';
    } catch (error) {
      status.value =
        error instanceof Error ? error.message : 'Failed to save file';
    }
  };

  const createFile = async (directory: string, name: string) => {
    const target = directory ? `${directory}/${name}` : name;
    await writeTextFile(target, '');
    await refreshTree();
    await openPath(target);
  };

  const createDirectory = async (directory: string, name: string) => {
    const target = directory ? `${directory}/${name}` : name;
    await mkdir(target);
    await refreshTree();
  };

  const removePath = async (path: string) => {
    await deleteEntry(path);
    closePath(path);
    await refreshTree();
  };

  const renamePath = async (from: string, to: string) => {
    await renameEntry(from, to);
    openFiles.value = openFiles.value.map(file =>
      file.path === from
        ? {...file, path: to, kind: previewKindForPath(to)}
        : file,
    );
    if (activePath.value === from) {
      activePath.value = to;
    }
    await refreshTree();
  };

  const uploadDroppedFiles = async (
    directory: string,
    files: FileList | File[],
  ) => {
    const list = Array.from(files);
    for (const file of list) {
      await uploadFile(directory, file);
    }
    await refreshTree();
    if (list[0]) {
      const uploaded = directory
        ? `${directory}/${list[0].name}`
        : list[0].name;
      await openPath(uploaded);
    }
  };

  return (
    <IdeContext.Provider
      value={{
        tree,
        treeError,
        drawerOpen,
        activeTab,
        openFiles,
        activePath,
        status,
        refreshTree,
        openPath,
        closePath,
        setActivePath,
        updateContent,
        saveActive,
        createFile,
        createDirectory,
        removePath,
        renamePath,
        uploadDroppedFiles,
      }}
    >
      {children}
    </IdeContext.Provider>
  );
}
