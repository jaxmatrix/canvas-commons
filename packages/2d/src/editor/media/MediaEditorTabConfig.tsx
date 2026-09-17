import {
  EditorPanel,
  MediaEditor as MediaEditorIcon,
  Pane,
  PluginTabConfig,
  PluginTabProps,
  Tab,
  usePanels,
} from '@canvas-commons/editor';
import {useSignalEffect} from '@preact/signals';
import {MediaControlsPanel} from './MediaControlsPanel';
import styles from './MediaEditor.module.scss';

function TabComponent({tab}: PluginTabProps) {
  const {bottom, sidebar} = usePanels();

  useSignalEffect(() => {
    if (sidebar.current.value === tab) {
      bottom.set(EditorPanel.MediaEditor);
    }
  });

  return (
    <Tab title="Media Editor" id="media-editor-sidebar-tab" tab={tab}>
      <MediaEditorIcon />
    </Tab>
  );
}

function PaneComponent() {
  return (
    <Pane title="Media Editor" id="media-editor-pane">
      <div className={styles.paneContent}>
        <MediaControlsPanel />
      </div>
    </Pane>
  );
}

export const MediaEditorTabConfig: PluginTabConfig = {
  name: 'media-editor',
  tabComponent: TabComponent,
  paneComponent: PaneComponent,
};
