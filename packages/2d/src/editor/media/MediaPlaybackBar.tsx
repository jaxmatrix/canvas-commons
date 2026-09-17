import {
  FastForward,
  FastRewind,
  IconButton,
  IconCheckbox,
  Pause,
  PlayArrow,
  SkipNext,
  SkipPrevious,
  usePreviewSettings,
} from '@canvas-commons/editor';
import styles from './MediaEditor.module.scss';
import {useMediaEditor} from './MediaEditorContext';

export function MediaPlaybackBar() {
  const {
    currentTime,
    duration,
    playing,
    togglePlayback,
    seekToStart,
    seekToEnd,
    stepByFrames,
  } = useMediaEditor();
  const {fps} = usePreviewSettings();
  const ready = duration.value > 0;

  return (
    <div className={styles.playback}>
      <code className={styles.time} title="Current time">
        {formatClock(currentTime.value)}
        <span className={styles.frames}>
          {Math.round(currentTime.value * fps)}
        </span>
      </code>
      <div className={styles.playbackControls}>
        <IconButton title="Start" onClick={seekToStart} disabled={!ready}>
          <SkipPrevious />
        </IconButton>
        <IconButton
          title="Previous frame"
          onClick={() => stepByFrames(-1, fps)}
          disabled={!ready}
        >
          <FastRewind />
        </IconButton>
        <IconCheckbox
          main
          titleOn="Pause"
          titleOff="Play"
          checked={playing.value}
          onChange={() => togglePlayback()}
        >
          {playing.value ? <Pause /> : <PlayArrow />}
        </IconCheckbox>
        <IconButton
          title="Next frame"
          onClick={() => stepByFrames(1, fps)}
          disabled={!ready}
        >
          <FastForward />
        </IconButton>
        <IconButton title="End" onClick={seekToEnd} disabled={!ready}>
          <SkipNext />
        </IconButton>
      </div>
      <code className={styles.duration} title="Duration">
        <span className={styles.frames}>
          {Math.round(duration.value * fps)}
        </span>
        {formatClock(duration.value)}
      </code>
    </div>
  );
}

function formatClock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00';
  }

  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');
  return `${minutes}:${rest}`;
}
