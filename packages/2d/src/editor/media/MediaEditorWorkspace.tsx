import {useEffect} from 'preact/hooks';
import styles from './MediaEditor.module.scss';
import {useMediaEditor} from './MediaEditorContext';
import {MediaPlaybackBar} from './MediaPlaybackBar';
import {MediaPlaybackProgress} from './MediaPlaybackProgress';
import {MediaRegionInspector} from './MediaRegionInspector';
import {MediaSourceTimeline} from './MediaSourceTimeline';

export function MediaEditorWorkspace() {
  const {selectedRegion, removeRegion} = useMediaEditor();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      const selected = selectedRegion.value;
      if (!selected) {
        return;
      }

      event.preventDefault();
      removeRegion(selected.kind, selected.index);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedRegion, removeRegion]);

  return (
    <div className={styles.workspace}>
      <MediaPlaybackProgress />
      <MediaPlaybackBar />
      <MediaRegionInspector />
      <div className={styles.workspaceTimeline}>
        <MediaSourceTimeline />
      </div>
    </div>
  );
}
