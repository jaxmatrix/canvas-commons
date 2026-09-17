export interface MediaLetterboxDest {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Letterbox a media aspect ratio into a container, with optional edge inset.
 */
export function letterboxMediaDest(
  containerWidth: number,
  containerHeight: number,
  sourceAspect: number,
  insetPx = 0,
): MediaLetterboxDest {
  const inset = Math.max(
    0,
    Math.min(insetPx, containerWidth / 2, containerHeight / 2),
  );
  const availableWidth = Math.max(1, containerWidth - inset * 2);
  const availableHeight = Math.max(1, containerHeight - inset * 2);
  const containerAspect = availableWidth / availableHeight;

  if (containerAspect > sourceAspect) {
    const height = availableHeight;
    const width = height * sourceAspect;
    return {
      x: inset + (availableWidth - width) / 2,
      y: inset,
      width,
      height,
    };
  }

  const width = availableWidth;
  const height = width / sourceAspect;
  return {
    x: inset,
    y: inset + (availableHeight - height) / 2,
    width,
    height,
  };
}

/** Inset used while editing a zoom region so handles clear panel edges. */
export const ZOOM_EDIT_LETTERBOX_INSET = 24;
