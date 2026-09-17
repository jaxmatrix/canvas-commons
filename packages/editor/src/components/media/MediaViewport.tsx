import {FunctionComponent} from 'preact';
import {useApplication, usePanels} from '../../contexts';
import {EditorPanel} from '../../signals';
import styles from './MediaEditorSlot.module.scss';

export function MediaViewport() {
  const {plugins} = useApplication();
  const {bottom} = usePanels();

  if (bottom.current.value !== EditorPanel.MediaEditor) {
    return null;
  }

  let Component: FunctionComponent | undefined;
  for (const plugin of plugins) {
    if (plugin.mediaViewport) {
      Component = plugin.mediaViewport;
      break;
    }
  }

  if (!Component) {
    return (
      <div className={styles.viewportEmpty}>
        No media preview available for this project.
      </div>
    );
  }

  return (
    <div className={styles.viewport}>
      <Component />
    </div>
  );
}

export function useMediaViewportActive() {
  const {plugins} = useApplication();
  const {bottom} = usePanels();
  const hasViewport = plugins.some(plugin => plugin.mediaViewport);
  return bottom.current.value === EditorPanel.MediaEditor && hasViewport;
}
