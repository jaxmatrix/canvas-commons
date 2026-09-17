import {
  MouseButton,
  MouseMask,
  TimelineContextProvider,
  TimelineState,
  clamp,
  usePreviewSettings,
  useStorage,
} from '@canvas-commons/editor';
import {useSignal} from '@preact/signals';
import clsx from 'clsx';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'preact/hooks';
import styles from './MediaEditor.module.scss';
import {useMediaEditor} from './MediaEditorContext';
import {MediaRegionTrack} from './MediaRegionTrack';

const ZOOM_SPEED = 0.1;
const ZOOM_MIN = 0.5;
const TIMESTAMP_SPACING = 32;
const VIRTUAL_SCROLL_SPACING = 256;
const MAX_FRAME_SIZE = 128;

function useElementSize(ref: {current: HTMLElement | null}) {
  const [rect, setRect] = useState(new DOMRect());
  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    const observer = new ResizeObserver(() => {
      setRect(element.getBoundingClientRect());
    });
    observer.observe(element);
    setRect(element.getBoundingClientRect());
    return () => observer.disconnect();
  }, [ref.current]);

  return rect;
}

export function MediaSourceTimeline() {
  const {selectedAsset, duration, currentTime, setCurrentTime} =
    useMediaEditor();
  const {fps} = usePreviewSettings();
  const containerRef = useRef<HTMLDivElement>(null);
  const playheadPreviewRef = useRef<HTMLDivElement>(null);
  const rect = useElementSize(containerRef);
  const [offset, setOffset] = useStorage('media-timeline-offset', 0);
  const [scale, setScale] = useStorage('media-timeline-scale', 1);
  const seeking = useSignal<number | null>(null);
  const draggingTime = useSignal<number | null>(null);

  const mediaDuration = duration.value;
  const durationFrames = Math.max(1, mediaDuration * fps);
  const isReady = mediaDuration > 0 && !!selectedAsset.value;

  useLayoutEffect(() => {
    if (containerRef.current && rect.width > 0 && isReady) {
      containerRef.current.scrollLeft = offset;
    }
  }, [rect.width > 0 && isReady]);

  useLayoutEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollLeft = offset;
    }
  }, [scale]);
  const sizes = useMemo(
    () => ({
      viewLength: rect.width,
      paddingLeft: rect.width / 2,
      fullLength: rect.width * scale + rect.width,
      playableLength: rect.width * scale,
    }),
    [rect.width, scale],
  );

  const zoomMax =
    durationFrames > 0
      ? (MAX_FRAME_SIZE / Math.max(1, sizes.viewLength)) * durationFrames
      : ZOOM_MIN;

  const conversion = useMemo(
    () => ({
      framesToPixels: (value: number) =>
        (value / durationFrames) * sizes.playableLength,
      secondsToPixels: (value: number) =>
        (value / mediaDuration) * sizes.playableLength,
      framesToPercents: (value: number) => (value / durationFrames) * 100,
      secondsToPercents: (value: number) => (value / mediaDuration) * 100,
      pixelsToFrames: (value: number) =>
        (value / sizes.playableLength) * durationFrames,
      pixelsToSeconds: (value: number) =>
        (value / sizes.playableLength) * mediaDuration,
    }),
    [durationFrames, mediaDuration, sizes],
  );

  const state = useMemo<TimelineState>(() => {
    const density = Math.pow(
      2,
      Math.round(Math.log2(durationFrames / Math.max(1, sizes.playableLength))),
    );
    const segmentDensity = Math.max(1, Math.floor(TIMESTAMP_SPACING * density));
    const virtualScrollDensity = Math.max(
      1,
      Math.floor(VIRTUAL_SCROLL_SPACING * density),
    );
    const relativeOffset = offset - sizes.paddingLeft;
    const firstVisibleFrame =
      Math.floor(
        conversion.pixelsToFrames(relativeOffset) / virtualScrollDensity,
      ) * virtualScrollDensity;
    const lastVisibleFrame =
      Math.ceil(
        conversion.pixelsToFrames(
          relativeOffset + sizes.viewLength + TIMESTAMP_SPACING,
        ) / virtualScrollDensity,
      ) * virtualScrollDensity;
    const startPosition = sizes.paddingLeft + rect.x - offset;

    return {
      viewLength: sizes.viewLength,
      offset: relativeOffset,
      firstVisibleTime: firstVisibleFrame / fps,
      firstVisibleFrame,
      lastVisibleTime: lastVisibleFrame / fps,
      lastVisibleFrame,
      density,
      segmentDensity,
      pointerToSeconds: (value: number) =>
        conversion.pixelsToSeconds(value - startPosition),
      pointerToFrames: (value: number) =>
        conversion.pixelsToFrames(value - startPosition),
      ...conversion,
    };
  }, [sizes, conversion, durationFrames, offset, fps, rect.x]);

  useLayoutEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollLeft = offset;
    }
  }, [scale]);

  const scrub = (clientX: number) => {
    const seconds = clamp(0, mediaDuration, state.pointerToSeconds(clientX));
    seeking.value = seconds;
    setCurrentTime(seconds);
  };

  const timestamps = [];
  if (isReady) {
    const clampedDensity = Math.max(1, state.segmentDensity);
    for (
      let frame = state.firstVisibleFrame;
      frame < state.lastVisibleFrame;
      frame += clampedDensity
    ) {
      timestamps.push(
        <div
          key={frame}
          className={clsx(styles.timestamp, {
            [styles.odd]:
              state.segmentDensity > 0 &&
              (frame / state.segmentDensity) % 2 !== 0,
          })}
          style={{left: `${state.framesToPercents(frame)}%`}}
          data-frame={frame}
        />,
      );
    }
  }

  const playheadSeconds = seeking.value ?? currentTime.value;
  const previewSeconds = draggingTime.value;
  const playheadFrame = Math.round((previewSeconds ?? playheadSeconds) * fps);

  return (
    <TimelineContextProvider state={state}>
      <div className={clsx(styles.root, isReady && styles.show)}>
        {!selectedAsset.value ? (
          <div className={styles.timelineEmpty}>
            Add a Video or Audio node to the scene to begin editing media.
          </div>
        ) : !isReady ? (
          <div className={styles.timelineEmpty} ref={containerRef}>
            Loading media duration…
          </div>
        ) : (
          <div
            className={styles.timelineWrapper}
            ref={containerRef}
            onScroll={event =>
              setOffset((event.target as HTMLElement).scrollLeft)
            }
            onWheel={event => {
              const isVertical =
                Math.abs(event.deltaX) > Math.abs(event.deltaY);
              if (event.shiftKey || isVertical) return;
              event.preventDefault();

              let ratio = 1 - Math.sign(event.deltaY) * ZOOM_SPEED;
              let newScale = scale * ratio;
              if (newScale < ZOOM_MIN) {
                newScale = ZOOM_MIN;
                ratio = newScale / scale;
              }
              if (newScale > zoomMax) {
                newScale = zoomMax;
                ratio = newScale / scale;
              }
              if (newScale === scale) {
                return;
              }

              const pointer = offset - sizes.paddingLeft + event.x - rect.x;
              const newTrackSize = rect.width * newScale + rect.width;
              const maxOffset = newTrackSize - rect.width;
              const newOffset = clamp(
                0,
                maxOffset,
                offset - pointer + pointer * ratio,
              );

              containerRef.current!.scrollLeft = newOffset;
              if (!isNaN(newScale)) {
                setScale(newScale);
              }
              if (!isNaN(newOffset)) {
                setOffset(newOffset);
              }
              if (playheadPreviewRef.current) {
                playheadPreviewRef.current.style.left = `${
                  event.x - rect.x + newOffset
                }px`;
              }
            }}
            onPointerDown={event => {
              if (
                (event.target as HTMLElement).closest('[class*="regionTrack"]')
              ) {
                return;
              }
              if (event.button === MouseButton.Left) {
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                if (playheadPreviewRef.current) {
                  playheadPreviewRef.current.style.display = 'none';
                }
                scrub(event.clientX);
              } else if (event.button === MouseButton.Middle) {
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                if (containerRef.current) {
                  containerRef.current.style.cursor = 'grabbing';
                }
              }
            }}
            onPointerMove={event => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                if (event.buttons & MouseMask.Primary) {
                  scrub(event.clientX);
                } else if (event.buttons & MouseMask.Auxiliary) {
                  const newOffset = clamp(
                    0,
                    sizes.playableLength,
                    offset - event.movementX,
                  );
                  setOffset(newOffset);
                  if (containerRef.current) {
                    containerRef.current.scrollLeft = newOffset;
                  }
                }
              } else if (
                draggingTime.value === null &&
                playheadPreviewRef.current
              ) {
                playheadPreviewRef.current.style.left = `${
                  event.x - rect.x + offset
                }px`;
              }
            }}
            onPointerUp={event => {
              if (draggingTime.value === null && playheadPreviewRef.current) {
                playheadPreviewRef.current.style.left = `${
                  event.x - rect.x + offset
                }px`;
              }
              if (
                event.button === MouseButton.Left ||
                event.button === MouseButton.Middle
              ) {
                seeking.value = null;
                event.currentTarget.releasePointerCapture(event.pointerId);
                if (containerRef.current) {
                  containerRef.current.style.cursor = '';
                }
                if (playheadPreviewRef.current) {
                  playheadPreviewRef.current.style.display = '';
                }
              }
            }}
          >
            <div
              className={styles.timeline}
              style={{width: `${sizes.fullLength}px`}}
            >
              <div
                className={styles.timelineContent}
                style={{
                  width: `${sizes.playableLength}px`,
                  left: `${sizes.paddingLeft}px`,
                }}
              >
                {timestamps}
                <div className={styles.trackContainer}>
                  <MediaRegionTrack
                    kind="skip"
                    label="Skip"
                    fps={fps}
                    mediaDuration={mediaDuration}
                    draggingTime={draggingTime}
                  />
                  <MediaRegionTrack
                    kind="speed"
                    label="Speed"
                    fps={fps}
                    mediaDuration={mediaDuration}
                    draggingTime={draggingTime}
                  />
                  {selectedAsset.value?.kind === 'video' && (
                    <MediaRegionTrack
                      kind="zoom"
                      label="Zoom"
                      fps={fps}
                      mediaDuration={mediaDuration}
                      draggingTime={draggingTime}
                    />
                  )}
                </div>
                <div
                  className={styles.playhead}
                  data-frame={playheadFrame}
                  style={{
                    left: `${state.framesToPixels(playheadFrame)}px`,
                  }}
                />
              </div>
            </div>
            <div ref={playheadPreviewRef} className={styles.playheadPreview} />
          </div>
        )}
      </div>
    </TimelineContextProvider>
  );
}
