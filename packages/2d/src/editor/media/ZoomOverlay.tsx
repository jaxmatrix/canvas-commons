import type {NormalizedRect} from '@canvas-commons/2d';
import {MouseButton} from '@canvas-commons/editor';
import clsx from 'clsx';
import type {JSX} from 'preact';
import {useEffect, useRef, useState} from 'preact/hooks';
import {
  letterboxMediaDest,
  ZOOM_EDIT_LETTERBOX_INSET,
  type MediaLetterboxDest,
} from './letterboxMediaDest';
import styles from './MediaEditor.module.scss';
import {applyZoomHandle, type ZoomResizeHandle} from './zoomAspect';

interface ZoomOverlayProps {
  videoWidth: number;
  videoHeight: number;
  frame: NormalizedRect;
  rect: NormalizedRect;
  onChange: (rect: NormalizedRect) => void;
}

export function ZoomOverlay({
  videoWidth,
  videoHeight,
  frame,
  rect,
  onChange,
}: ZoomOverlayProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [dest, setDest] = useState<MediaLetterboxDest | null>(null);
  const [localRect, setLocalRect] = useState(rect);
  const localRef = useRef(rect);
  const frameRef = useRef(frame);
  const dragRef = useRef<{
    handle: ZoomResizeHandle;
    startX: number;
    startY: number;
    origin: NormalizedRect;
  } | null>(null);

  useEffect(() => {
    setLocalRect(rect);
    localRef.current = rect;
  }, [rect.x, rect.y, rect.width, rect.height]);

  useEffect(() => {
    frameRef.current = frame;
  }, [frame.x, frame.y, frame.width, frame.height]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || videoWidth <= 0 || videoHeight <= 0) {
      setDest(null);
      return;
    }

    const update = () => {
      const bounds = root.getBoundingClientRect();
      setDest(
        letterboxMediaDest(
          bounds.width,
          bounds.height,
          videoWidth / videoHeight,
          ZOOM_EDIT_LETTERBOX_INSET,
        ),
      );
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(root);
    return () => observer.disconnect();
  }, [videoWidth, videoHeight]);

  if (!dest || dest.width <= 0 || dest.height <= 0) {
    return <div ref={rootRef} className={styles.zoomOverlayRoot} />;
  }

  const style = {
    left: dest.x + localRect.x * dest.width,
    top: dest.y + localRect.y * dest.height,
    width: localRect.width * dest.width,
    height: localRect.height * dest.height,
  };

  const beginDrag = (
    handle: ZoomResizeHandle,
    event: JSX.TargetedPointerEvent<HTMLDivElement>,
  ) => {
    if (event.button !== MouseButton.Left) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      handle,
      startX: event.clientX,
      startY: event.clientY,
      origin: {...localRef.current},
    };
  };

  const onPointerMove = (event: JSX.TargetedPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) {
      return;
    }

    const dx = (event.clientX - drag.startX) / dest.width;
    const dy = (event.clientY - drag.startY) / dest.height;
    const next = applyZoomHandle(
      drag.handle,
      drag.origin,
      dx,
      dy,
      frameRef.current,
    );
    localRef.current = next;
    setLocalRect(next);
  };

  const onPointerUp = (event: JSX.TargetedPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) {
      return;
    }

    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onChange({...localRef.current});
  };

  return (
    <div ref={rootRef} className={styles.zoomOverlayRoot}>
      <div
        className={styles.zoomOverlay}
        style={style}
        onPointerDown={event => beginDrag('move', event)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const).map(handle => (
          <div
            key={handle}
            className={clsx(styles.zoomHandle, styles[`zoomHandle_${handle}`])}
            onPointerDown={event => beginDrag(handle, event)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
        ))}
      </div>
    </div>
  );
}
