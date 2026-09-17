import {
  BBox,
  easeInOutCubic,
  resolveRegionEase,
  type MediaZoomRect,
  type MediaZoomRegion,
} from '@canvas-commons/core';

/**
 * A rectangle expressed in normalized coordinates relative to a media source.
 */
export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const FULL_NORMALIZED_RECT: NormalizedRect = {
  x: 0,
  y: 0,
  width: 1,
  height: 1,
};

export function normalizeMediaRect(rect?: NormalizedRect): NormalizedRect {
  if (!rect) {
    return FULL_NORMALIZED_RECT;
  }

  return {...rect};
}

/**
 * Convert a normalized rectangle to pixel coordinates.
 */
export function normalizedToPixelBBox(
  rect: NormalizedRect,
  width: number,
  height: number,
): BBox {
  return new BBox(
    rect.x * width,
    rect.y * height,
    rect.width * width,
    rect.height * height,
  );
}

/**
 * Resolve the source pixel region to draw after applying a frame crop and zoom
 * focus within that frame.
 */
export function resolveMediaSourceBBox(
  frame: NormalizedRect,
  zoom: NormalizedRect,
  width: number,
  height: number,
): BBox {
  const framePixels = normalizedToPixelBBox(frame, width, height);
  const zoomPixels = normalizedToPixelBBox(zoom, width, height);

  const x = Math.max(framePixels.x, zoomPixels.x);
  const y = Math.max(framePixels.y, zoomPixels.y);
  const right = Math.min(
    framePixels.x + framePixels.width,
    zoomPixels.x + zoomPixels.width,
  );
  const bottom = Math.min(
    framePixels.y + framePixels.height,
    zoomPixels.y + zoomPixels.height,
  );

  return new BBox(x, y, Math.max(0, right - x), Math.max(0, bottom - y));
}

/**
 * Pick the zoom focus active at a media time.
 *
 * @remarks
 * Returns the first zoom region covering `mediaTime`, easing in/out between
 * `defaultZoom` and the region rect when configured. Otherwise `defaultZoom`.
 *
 * @example
 * ```ts
 * const zoom = zoomAtTime(
 *   {x: 0, y: 0, width: 1, height: 1},
 *   [{start: 1, end: 3, rect: {x: 0.25, y: 0.25, width: 0.5, height: 0.5}}],
 *   2,
 * );
 * ```
 */
export function zoomAtTime(
  defaultZoom: NormalizedRect,
  zoomRegions: ReadonlyArray<
    | MediaZoomRegion
    | {
        start: number;
        end: number;
        rect: MediaZoomRect;
        easeIn?: number;
        easeOut?: number;
      }
  >,
  mediaTime: number,
): NormalizedRect {
  const baseline = normalizeMediaRect(defaultZoom);
  const region = zoomRegions.find(
    item => mediaTime >= item.start && mediaTime < item.end,
  );
  if (!region) {
    return baseline;
  }

  const target = normalizeMediaRect(region.rect);
  const {easeIn, easeOut} = resolveRegionEase(region);

  if (easeIn > 0 && mediaTime < region.start + easeIn) {
    const progress = (mediaTime - region.start) / easeIn;
    return lerpRect(baseline, target, easeInOutCubic(progress));
  }

  if (easeOut > 0 && mediaTime >= region.end - easeOut) {
    const progress = (mediaTime - (region.end - easeOut)) / easeOut;
    return lerpRect(target, baseline, easeInOutCubic(progress));
  }

  return target;
}

function lerpRect(
  from: NormalizedRect,
  to: NormalizedRect,
  t: number,
): NormalizedRect {
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    width: from.width + (to.width - from.width) * t,
    height: from.height + (to.height - from.height) * t,
  };
}

/**
 * Clamp a zoom rect so it stays inside the frame with a minimum size.
 */
export function clampZoomRect(
  rect: NormalizedRect,
  frame: NormalizedRect,
  minSize = 0.05,
): NormalizedRect {
  const width = Math.max(minSize, Math.min(rect.width, frame.width));
  const height = Math.max(minSize, Math.min(rect.height, frame.height));
  const maxX = frame.x + frame.width - width;
  const maxY = frame.y + frame.height - height;
  return {
    x: Math.min(Math.max(rect.x, frame.x), maxX),
    y: Math.min(Math.max(rect.y, frame.y), maxY),
    width,
    height,
  };
}
