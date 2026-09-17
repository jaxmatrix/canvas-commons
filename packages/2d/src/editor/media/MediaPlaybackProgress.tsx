import styles from './MediaEditor.module.scss';
import {useMediaEditor} from './MediaEditorContext';

export function MediaPlaybackProgress() {
  const {currentTime, duration} = useMediaEditor();
  const completion =
    duration.value > 0 ? Math.min(1, currentTime.value / duration.value) : 0;

  return (
    <div className={styles.progress}>
      <div
        className={styles.progressFill}
        style={{width: `${completion * 100}%`}}
      />
    </div>
  );
}
