import {FunctionComponent} from 'preact';
import {useApplication} from '../../contexts';
import styles from './MediaEditorSlot.module.scss';

export function MediaEditorSlot() {
  const {plugins} = useApplication();
  let Component: FunctionComponent | undefined;

  for (const plugin of plugins) {
    if (plugin.mediaEditor) {
      Component = plugin.mediaEditor;
      break;
    }
  }

  if (!Component) {
    return (
      <div className={styles.empty}>
        No media editor plugin registered for this project.
      </div>
    );
  }

  return <Component />;
}
