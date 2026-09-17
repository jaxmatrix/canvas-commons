import {describe, expect, test} from 'vitest';
import {
  FULL_NORMALIZED_RECT,
  clampZoomRect,
  normalizeMediaRect,
  resolveMediaSourceBBox,
  zoomAtTime,
} from './mediaFrame';

describe('mediaFrame', () => {
  test('resolves the intersection of frame and zoom', () => {
    const source = resolveMediaSourceBBox(
      {x: 0, y: 0, width: 0.5, height: 1},
      {x: 0.25, y: 0.25, width: 0.5, height: 0.5},
      1000,
      500,
    );

    expect(source.x).toBe(250);
    expect(source.y).toBe(125);
    expect(source.width).toBe(250);
    expect(source.height).toBe(250);
  });

  test('defaults missing rects to the full frame', () => {
    expect(normalizeMediaRect(undefined)).toEqual(FULL_NORMALIZED_RECT);
  });

  test('picks the active zoom region at a media time', () => {
    const zoom = zoomAtTime(
      FULL_NORMALIZED_RECT,
      [
        {
          start: 1,
          end: 3,
          rect: {x: 0.25, y: 0.25, width: 0.5, height: 0.5},
        },
      ],
      2,
    );
    expect(zoom).toEqual({x: 0.25, y: 0.25, width: 0.5, height: 0.5});
  });

  test('falls back to the default zoom outside regions', () => {
    const zoom = zoomAtTime(
      {x: 0.1, y: 0.1, width: 0.8, height: 0.8},
      [
        {
          start: 1,
          end: 3,
          rect: {x: 0.25, y: 0.25, width: 0.5, height: 0.5},
        },
      ],
      4,
    );
    expect(zoom).toEqual({x: 0.1, y: 0.1, width: 0.8, height: 0.8});
  });

  test('clamps a zoom rect inside the frame', () => {
    const clamped = clampZoomRect(
      {x: -0.5, y: 0.9, width: 2, height: 2},
      {x: 0, y: 0, width: 1, height: 1},
    );
    expect(clamped.x).toBe(0);
    expect(clamped.y).toBe(0);
    expect(clamped.width).toBe(1);
    expect(clamped.height).toBe(1);
  });

  test('eases zoom into the target rect', () => {
    const target = {x: 0.25, y: 0.25, width: 0.5, height: 0.5};
    const start = zoomAtTime(
      FULL_NORMALIZED_RECT,
      [{start: 0, end: 4, rect: target, easeIn: 1, easeOut: 0}],
      0,
    );
    expect(start).toEqual(FULL_NORMALIZED_RECT);

    const mid = zoomAtTime(
      FULL_NORMALIZED_RECT,
      [{start: 0, end: 4, rect: target, easeIn: 1, easeOut: 0}],
      0.5,
    );
    expect(mid.width).toBeGreaterThan(0.5);
    expect(mid.width).toBeLessThan(1);

    const held = zoomAtTime(
      FULL_NORMALIZED_RECT,
      [{start: 0, end: 4, rect: target, easeIn: 1, easeOut: 0}],
      2,
    );
    expect(held).toEqual(target);
  });

  test('eases zoom out of the target rect', () => {
    const target = {x: 0.25, y: 0.25, width: 0.5, height: 0.5};
    const mid = zoomAtTime(
      FULL_NORMALIZED_RECT,
      [{start: 0, end: 4, rect: target, easeIn: 0, easeOut: 1}],
      3.5,
    );
    expect(mid.width).toBeGreaterThan(0.5);
    expect(mid.width).toBeLessThan(1);
  });
});
