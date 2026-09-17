import {
  DragIndicator,
  MouseButton,
  useTimelineContext,
} from '@canvas-commons/editor';
import {Signal} from '@preact/signals';
import clsx from 'clsx';
import {useEffect, useRef, useState} from 'preact/hooks';
import styles from './MediaEditor.module.scss';
import {useMediaEditor} from './MediaEditorContext';
import type {MediaRegionKind} from './types';

interface MediaRegionTrackProps {
  kind: MediaRegionKind;
  label: string;
  fps: number;
  mediaDuration: number;
  draggingTime: Signal<number | null>;
}

export function MediaRegionTrack({
  kind,
  label,
  fps,
  mediaDuration,
  draggingTime,
}: MediaRegionTrackProps) {
  const {settings, selectedRegion, addRegion, updateRegion, setCurrentTime} =
    useMediaEditor();
  const {pixelsToFrames, framesToPercents, pointerToFrames} =
    useTimelineContext();

  const regions =
    kind === 'skip'
      ? settings.value.skipRegions
      : kind === 'speed'
        ? settings.value.speedRegions
        : settings.value.zoomRegions;

  const [draft, setDraft] = useState<{start: number; end: number} | null>(null);
  const draftRef = useRef<{start: number; end: number} | null>(null);

  const framesToSeconds = (frames: number) => frames / fps;

  const clampRegion = (start: number, end: number) => {
    let nextStart = Math.max(0, Math.min(mediaDuration, start));
    let nextEnd = Math.max(0, Math.min(mediaDuration, end));
    if (nextEnd < nextStart) {
      [nextStart, nextEnd] = [nextEnd, nextStart];
    }
    return {start: nextStart, end: nextEnd};
  };

  const secondsToFrames = (seconds: number) => seconds * fps;

  return (
    <div
      className={clsx(styles.regionTrack, styles[kind])}
      onPointerDown={event => {
        if (event.button !== MouseButton.Left) {
          return;
        }

        const target = event.target as HTMLElement;
        if (target.closest('[data-media-region]')) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);

        const start = framesToSeconds(pointerToFrames(event.clientX));
        const next = {start, end: start};
        draftRef.current = next;
        setDraft(next);
        draggingTime.value = start;
        setCurrentTime(start);
      }}
      onPointerMove={event => {
        if (
          !draftRef.current ||
          !event.currentTarget.hasPointerCapture(event.pointerId)
        ) {
          return;
        }

        event.stopPropagation();
        const end = framesToSeconds(pointerToFrames(event.clientX));
        const next = {start: draftRef.current.start, end};
        draftRef.current = next;
        setDraft(next);
        draggingTime.value = end;
        setCurrentTime(end);
      }}
      onPointerUp={event => {
        if (event.button !== MouseButton.Left || !draftRef.current) {
          return;
        }

        event.currentTarget.releasePointerCapture(event.pointerId);
        const {start, end} = clampRegion(
          draftRef.current.start,
          draftRef.current.end,
        );
        draftRef.current = null;
        setDraft(null);
        draggingTime.value = null;

        if (end - start > 0.05) {
          addRegion(kind, start, end, kind === 'speed' ? 2 : undefined);
        }
      }}
    >
      <div className={styles.regionTrackLabel}>{label}</div>

      {draft && (
        <div
          className={styles.regionDraft}
          style={regionStyle(
            clampRegion(draft.start, draft.end),
            secondsToFrames,
            framesToPercents,
            mediaDuration,
          )}
        />
      )}

      {regions.map((region, index) => {
        const rate =
          kind === 'speed' && 'rate' in region
            ? (region.rate as number)
            : undefined;

        return (
          <RegionClip
            key={`${kind}-${index}`}
            kind={kind}
            index={index}
            start={region.start}
            end={region.end}
            rate={rate}
            selected={
              selectedRegion.value?.kind === kind &&
              selectedRegion.value.index === index
            }
            fps={fps}
            mediaDuration={mediaDuration}
            pixelsToFrames={pixelsToFrames}
            framesToPercents={framesToPercents}
            onSelect={() => {
              selectedRegion.value = {kind, index};
            }}
            onCommit={(start, end) => {
              const clamped = clampRegion(start, end);
              if (clamped.end - clamped.start < 0.01) {
                return;
              }
              updateRegion(kind, index, clamped);
            }}
            onDragTime={time => {
              draggingTime.value = time;
              setCurrentTime(time);
            }}
            onDragEnd={() => {
              draggingTime.value = null;
            }}
          />
        );
      })}
    </div>
  );
}

interface RegionClipProps {
  kind: MediaRegionKind;
  index: number;
  start: number;
  end: number;
  rate?: number;
  selected: boolean;
  fps: number;
  mediaDuration: number;
  pixelsToFrames: (value: number) => number;
  framesToPercents: (value: number) => number;
  onSelect: () => void;
  onCommit: (start: number, end: number) => void;
  onDragTime: (time: number) => void;
  onDragEnd: () => void;
}

function RegionClip({
  kind,
  start,
  end,
  rate,
  selected,
  fps,
  mediaDuration,
  pixelsToFrames,
  framesToPercents,
  onSelect,
  onCommit,
  onDragTime,
  onDragEnd,
}: RegionClipProps) {
  const [localStart, setLocalStart] = useState(start);
  const [localEnd, setLocalEnd] = useState(end);
  const localRef = useRef({start, end});

  useEffect(() => {
    setLocalStart(start);
    setLocalEnd(end);
    localRef.current = {start, end};
  }, [start, end]);

  const secondsToFrames = (seconds: number) => seconds * fps;
  const framesToSeconds = (frames: number) => frames / fps;

  const style = regionStyle(
    {start: localStart, end: localEnd},
    secondsToFrames,
    framesToPercents,
    mediaDuration,
  );

  return (
    <div
      className={clsx(styles.region, selected && styles.selected)}
      data-media-region={kind}
      style={{
        ...style,
        flexDirection: localStart > localEnd ? 'row-reverse' : 'row',
      }}
      onPointerDown={event => {
        if (event.button !== MouseButton.Left) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        onSelect();
      }}
      onPointerMove={event => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
          return;
        }

        event.stopPropagation();
        const delta = framesToSeconds(pixelsToFrames(event.movementX));
        const width = Math.abs(localRef.current.end - localRef.current.start);
        let nextStart = localRef.current.start + delta;
        let nextEnd = localRef.current.end + delta;

        if (nextStart < 0) {
          nextStart = 0;
          nextEnd = width;
        }
        if (nextEnd > mediaDuration) {
          nextEnd = mediaDuration;
          nextStart = mediaDuration - width;
        }

        localRef.current = {start: nextStart, end: nextEnd};
        setLocalStart(nextStart);
        setLocalEnd(nextEnd);
        onDragTime(nextStart);
      }}
      onPointerUp={event => {
        if (event.button !== MouseButton.Left) {
          return;
        }

        event.currentTarget.releasePointerCapture(event.pointerId);
        onCommit(localRef.current.start, localRef.current.end);
        onDragEnd();
      }}
    >
      <RegionHandle
        onChange={delta => {
          const nextStart = Math.min(
            localRef.current.start + delta,
            localRef.current.end - 0.01,
          );
          localRef.current = {...localRef.current, start: nextStart};
          setLocalStart(nextStart);
          onDragTime(nextStart);
        }}
        onCommit={() => {
          onCommit(localRef.current.start, localRef.current.end);
          onDragEnd();
        }}
        pixelsToFrames={pixelsToFrames}
        framesToSeconds={framesToSeconds}
      />
      <div className={styles.handleSpacer}>
        {kind === 'speed' && rate !== undefined ? `${rate}x` : null}
        {kind === 'zoom' ? 'Zoom' : null}
      </div>
      <RegionHandle
        onChange={delta => {
          const nextEnd = Math.max(
            localRef.current.end + delta,
            localRef.current.start + 0.01,
          );
          localRef.current = {...localRef.current, end: nextEnd};
          setLocalEnd(nextEnd);
          onDragTime(nextEnd);
        }}
        onCommit={() => {
          onCommit(localRef.current.start, localRef.current.end);
          onDragEnd();
        }}
        pixelsToFrames={pixelsToFrames}
        framesToSeconds={framesToSeconds}
      />
    </div>
  );
}

function RegionHandle({
  onChange,
  onCommit,
  pixelsToFrames,
  framesToSeconds,
}: {
  onChange: (deltaSeconds: number) => void;
  onCommit: () => void;
  pixelsToFrames: (value: number) => number;
  framesToSeconds: (frames: number) => number;
}) {
  return (
    <DragIndicator
      className={styles.handle}
      onPointerDown={event => {
        if (event.button !== MouseButton.Left) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
          return;
        }
        event.stopPropagation();
        onChange(framesToSeconds(pixelsToFrames(event.movementX)));
      }}
      onPointerUp={event => {
        if (event.button !== MouseButton.Left) {
          return;
        }
        event.stopPropagation();
        event.currentTarget.releasePointerCapture(event.pointerId);
        onCommit();
      }}
    />
  );
}

function regionStyle(
  region: {start: number; end: number},
  secondsToFrames: (seconds: number) => number,
  framesToPercents: (frames: number) => number,
  mediaDuration: number,
) {
  const start = Math.min(region.start, region.end);
  const end = Math.max(region.start, region.end);

  return {
    left: `${framesToPercents(Math.ceil(secondsToFrames(Math.max(0, start))))}%`,
    right: `${
      100 -
      framesToPercents(Math.ceil(secondsToFrames(Math.min(mediaDuration, end))))
    }%`,
  };
}
