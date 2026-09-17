import type {NormalizedRect} from '@canvas-commons/2d';

export type ZoomResizeHandle =
  | 'move'
  | 'n'
  | 's'
  | 'e'
  | 'w'
  | 'nw'
  | 'ne'
  | 'sw'
  | 'se';

/** Normalized width/height ratio of the frame (locks zoom to the same ratio). */
export function frameAspect(frame: NormalizedRect): number {
  return Math.max(1e-6, frame.width) / Math.max(1e-6, frame.height);
}

/**
 * Force a rect to the given aspect, preserving center, then clamp inside frame.
 */
export function snapRectToAspect(
  rect: NormalizedRect,
  aspect: number,
  frame: NormalizedRect,
): NormalizedRect {
  const ratio = Math.max(1e-6, aspect);
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;

  let width = Math.max(0.05, rect.width);
  let height = width / ratio;

  if (width > frame.width) {
    width = frame.width;
    height = width / ratio;
  }
  if (height > frame.height) {
    height = frame.height;
    width = height * ratio;
  }

  width = Math.max(0.05, Math.min(width, frame.width));
  height = width / ratio;
  if (height > frame.height) {
    height = Math.max(0.05, frame.height);
    width = height * ratio;
  }

  const maxX = frame.x + frame.width - width;
  const maxY = frame.y + frame.height - height;
  return {
    x: Math.min(Math.max(cx - width / 2, frame.x), maxX),
    y: Math.min(Math.max(cy - height / 2, frame.y), maxY),
    width,
    height,
  };
}

/**
 * Centered zoom inset inside the frame at half the limiting size, matching
 * frame aspect.
 */
export function centeredZoomInset(frame: NormalizedRect): NormalizedRect {
  const aspect = frameAspect(frame);
  const halfW = frame.width * 0.5;
  const halfH = halfW / aspect;
  let width = halfW;
  let height = halfH;
  if (height > frame.height * 0.5) {
    height = frame.height * 0.5;
    width = height * aspect;
  }
  return {
    x: frame.x + (frame.width - width) / 2,
    y: frame.y + (frame.height - height) / 2,
    width,
    height,
  };
}

/**
 * Apply a numeric field edit to a zoom rect, keeping frame aspect.
 */
export function applyZoomField(
  rect: NormalizedRect,
  field: 'x' | 'y' | 'width' | 'height',
  value: number,
  frame: NormalizedRect,
): NormalizedRect {
  const aspect = frameAspect(frame);
  if (field === 'x' || field === 'y') {
    return clampZoomToFrame({...rect, [field]: value}, frame, aspect);
  }

  if (field === 'width') {
    const width = Math.max(0.05, value);
    return clampZoomToFrame(
      {...rect, width, height: width / aspect},
      frame,
      aspect,
    );
  }

  const height = Math.max(0.05, value);
  return clampZoomToFrame(
    {...rect, height, width: height * aspect},
    frame,
    aspect,
  );
}

/**
 * Resize a zoom rect from an overlay handle, always locked to frame aspect.
 */
export function applyZoomHandle(
  handle: ZoomResizeHandle,
  origin: NormalizedRect,
  dx: number,
  dy: number,
  frame: NormalizedRect,
): NormalizedRect {
  if (handle === 'move') {
    return clampZoomToFrame(
      {
        x: origin.x + dx,
        y: origin.y + dy,
        width: origin.width,
        height: origin.height,
      },
      frame,
      frameAspect(frame),
    );
  }

  const aspect = frameAspect(frame);
  const resized = resizeLocked(handle, origin, dx, dy, aspect);
  return clampZoomToFrame(resized, frame, aspect);
}

export function clampZoomToFrame(
  rect: NormalizedRect,
  frame: NormalizedRect,
  aspect: number,
): NormalizedRect {
  return snapRectToAspect(rect, aspect, frame);
}

function resizeLocked(
  handle: ZoomResizeHandle,
  origin: NormalizedRect,
  dx: number,
  dy: number,
  aspect: number,
): NormalizedRect {
  let {x, y, width, height} = origin;

  const fromWidth = (nextWidth: number, anchor: 'w' | 'e') => {
    width = Math.max(0.05, nextWidth);
    height = width / aspect;
    if (anchor === 'w') {
      x = origin.x + origin.width - width;
    } else {
      x = origin.x;
    }
    y = origin.y + (origin.height - height) / 2;
  };

  const fromHeight = (nextHeight: number, anchor: 'n' | 's') => {
    height = Math.max(0.05, nextHeight);
    width = height * aspect;
    if (anchor === 'n') {
      y = origin.y + origin.height - height;
    } else {
      y = origin.y;
    }
    x = origin.x + (origin.width - width) / 2;
  };

  switch (handle) {
    case 'e':
      fromWidth(origin.width + dx, 'e');
      break;
    case 'w':
      fromWidth(origin.width - dx, 'w');
      break;
    case 's':
      fromHeight(origin.height + dy, 's');
      break;
    case 'n':
      fromHeight(origin.height - dy, 'n');
      break;
    case 'se': {
      if (Math.abs(dx) * aspect >= Math.abs(dy)) {
        fromWidth(origin.width + dx, 'e');
        y = origin.y;
      } else {
        fromHeight(origin.height + dy, 's');
        x = origin.x;
      }
      break;
    }
    case 'sw': {
      if (Math.abs(dx) * aspect >= Math.abs(dy)) {
        fromWidth(origin.width - dx, 'w');
        y = origin.y;
      } else {
        fromHeight(origin.height + dy, 's');
        x = origin.x + origin.width - width;
      }
      break;
    }
    case 'ne': {
      if (Math.abs(dx) * aspect >= Math.abs(dy)) {
        fromWidth(origin.width + dx, 'e');
        y = origin.y + origin.height - height;
      } else {
        fromHeight(origin.height - dy, 'n');
        x = origin.x;
      }
      break;
    }
    case 'nw': {
      if (Math.abs(dx) * aspect >= Math.abs(dy)) {
        fromWidth(origin.width - dx, 'w');
        y = origin.y + origin.height - height;
      } else {
        fromHeight(origin.height - dy, 'n');
        x = origin.x + origin.width - width;
      }
      break;
    }
    default:
      break;
  }

  return {x, y, width, height};
}
