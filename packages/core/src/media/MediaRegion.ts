import {easeInOutCubic} from '../tweening';

/**
 * A portion of source media that should be skipped during playback.
 */
export interface MediaSkipRegion {
  /**
   * The start of the skipped range in source seconds (inclusive).
   */
  start: number;
  /**
   * The end of the skipped range in source seconds (exclusive).
   */
  end: number;
}

/**
 * A portion of source media that should play at a custom rate.
 */
export interface MediaSpeedRegion {
  /**
   * The start of the range in source seconds (inclusive).
   */
  start: number;
  /**
   * The end of the range in source seconds (exclusive).
   */
  end: number;
  /**
   * The playback rate to apply within this range.
   *
   * @remarks
   * Values greater than one consume source media faster. Must be greater than
   * zero.
   */
  rate: number;
  /**
   * Seconds at the start of the region used to ease from baseline rate to
   * {@link MediaSpeedRegion.rate}.
   *
   * @defaultValue 0.25
   */
  easeIn?: number;
  /**
   * Seconds at the end of the region used to ease from
   * {@link MediaSpeedRegion.rate} back to baseline.
   *
   * @defaultValue 0.25
   */
  easeOut?: number;
}

/**
 * A normalized rectangle in source-media coordinates.
 */
export interface MediaZoomRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A portion of source media that should use a custom zoom focus.
 */
export interface MediaZoomRegion {
  /**
   * The start of the range in source seconds (inclusive).
   */
  start: number;
  /**
   * The end of the range in source seconds (exclusive).
   */
  end: number;
  /**
   * The normalized zoom focus to apply within this range.
   */
  rect: MediaZoomRect;
  /**
   * Seconds at the start of the region used to ease from the default zoom to
   * {@link MediaZoomRegion.rect}.
   *
   * @defaultValue 0.25
   */
  easeIn?: number;
  /**
   * Seconds at the end of the region used to ease from
   * {@link MediaZoomRegion.rect} back to the default zoom.
   *
   * @defaultValue 0.25
   */
  easeOut?: number;
}

export interface MediaTimelinePosition {
  /**
   * The corresponding position in source media, in seconds.
   */
  mediaTime: number;
  /**
   * The effective playback rate at this position.
   */
  activeRate: number;
}

interface MediaSegment {
  sourceStart: number;
  sourceEnd: number;
  rate: number;
  timelineStart: number;
  timelineEnd: number;
}

/** Default ease-in / ease-out duration for speed and zoom regions. */
export const DEFAULT_MEDIA_EASE = 0.25;

const RAMP_STEPS = 8;

/**
 * Clamp ease-in/out so their sum never exceeds the region duration.
 */
export function resolveRegionEase(region: {
  start: number;
  end: number;
  easeIn?: number;
  easeOut?: number;
}): {easeIn: number; easeOut: number} {
  const duration = Math.max(0, region.end - region.start);
  let easeIn = Math.max(0, region.easeIn ?? DEFAULT_MEDIA_EASE);
  let easeOut = Math.max(0, region.easeOut ?? DEFAULT_MEDIA_EASE);
  if (easeIn + easeOut > duration) {
    if (duration <= 0) {
      return {easeIn: 0, easeOut: 0};
    }
    const scale = duration / (easeIn + easeOut);
    easeIn *= scale;
    easeOut *= scale;
  }
  return {easeIn, easeOut};
}

/**
 * Eased playback rate at a source media time (before base rate).
 */
export function rateAtMediaTime(
  speedRegions: ReadonlyArray<MediaSpeedRegion>,
  mediaTime: number,
  baseline = 1,
): number {
  const region = speedRegions.find(
    item => item.rate > 0 && mediaTime >= item.start && mediaTime < item.end,
  );
  if (!region) {
    return baseline;
  }

  const {easeIn, easeOut} = resolveRegionEase(region);
  if (easeIn > 0 && mediaTime < region.start + easeIn) {
    const progress = (mediaTime - region.start) / easeIn;
    return baseline + (region.rate - baseline) * easeInOutCubic(progress);
  }
  if (easeOut > 0 && mediaTime >= region.end - easeOut) {
    const progress = (mediaTime - (region.end - easeOut)) / easeOut;
    return region.rate + (baseline - region.rate) * easeInOutCubic(progress);
  }

  return region.rate;
}

export function normalizeSkipRegions(
  regions: MediaSkipRegion[],
): MediaSkipRegion[] {
  const sorted = regions
    .filter(region => region.end > region.start)
    .sort((a, b) => a.start - b.start);

  const merged: MediaSkipRegion[] = [];
  for (const region of sorted) {
    const last = merged[merged.length - 1];
    if (last && region.start <= last.end) {
      last.end = Math.max(last.end, region.end);
    } else {
      merged.push({...region});
    }
  }

  return merged;
}

export function buildMediaSegments(
  sourceDuration: number,
  skipRegions: MediaSkipRegion[],
  speedRegions: MediaSpeedRegion[],
  baseRate: number,
): MediaSegment[] {
  if (sourceDuration <= 0 || baseRate <= 0) {
    return [];
  }

  const skips = normalizeSkipRegions(skipRegions);
  const speeds = speedRegions
    .filter(region => region.end > region.start && region.rate > 0)
    .sort((a, b) => a.start - b.start);

  const segments: MediaSegment[] = [];
  let timeline = 0;
  let cursor = 0;

  const pushSegment = (
    sourceStart: number,
    sourceEnd: number,
    rate: number,
  ) => {
    if (sourceEnd <= sourceStart || rate <= 0) {
      return;
    }

    const timelineLength = (sourceEnd - sourceStart) / (rate * baseRate);
    segments.push({
      sourceStart,
      sourceEnd,
      rate,
      timelineStart: timeline,
      timelineEnd: timeline + timelineLength,
    });
    timeline += timelineLength;
  };

  const pushRamped = (sourceStart: number, sourceEnd: number) => {
    const span = sourceEnd - sourceStart;
    if (span <= 0) {
      return;
    }

    const steps = Math.max(1, RAMP_STEPS);
    for (let index = 0; index < steps; index++) {
      const start = sourceStart + (span * index) / steps;
      const end = sourceStart + (span * (index + 1)) / steps;
      const sample = (start + end) / 2;
      pushSegment(start, end, rateAtMediaTime(speeds, sample, 1));
    }
  };

  const splitBySpeed = (start: number, end: number) => {
    const boundaries = new Set<number>([start, end]);
    for (const region of speeds) {
      if (region.end <= start || region.start >= end) {
        continue;
      }
      const {easeIn, easeOut} = resolveRegionEase(region);
      boundaries.add(Math.max(start, region.start));
      boundaries.add(Math.min(end, region.end));
      if (easeIn > 0) {
        boundaries.add(Math.min(end, Math.max(start, region.start + easeIn)));
      }
      if (easeOut > 0) {
        boundaries.add(Math.min(end, Math.max(start, region.end - easeOut)));
      }
    }

    const points = [...boundaries].sort((a, b) => a - b);
    for (let index = 0; index < points.length - 1; index++) {
      const segmentStart = points[index];
      const segmentEnd = points[index + 1];
      if (segmentEnd <= segmentStart) {
        continue;
      }

      const midpoint = (segmentStart + segmentEnd) / 2;
      const speed = speeds.find(
        region => midpoint >= region.start && midpoint < region.end,
      );
      if (!speed) {
        pushSegment(segmentStart, segmentEnd, 1);
        continue;
      }

      const {easeIn, easeOut} = resolveRegionEase(speed);
      const inEaseIn = easeIn > 0 && midpoint < speed.start + easeIn;
      const inEaseOut = easeOut > 0 && midpoint >= speed.end - easeOut;
      if (inEaseIn || inEaseOut) {
        pushRamped(segmentStart, segmentEnd);
      } else {
        pushSegment(segmentStart, segmentEnd, speed.rate);
      }
    }
  };

  for (const skip of skips) {
    if (cursor < skip.start) {
      splitBySpeed(cursor, Math.min(skip.start, sourceDuration));
    }
    cursor = Math.max(cursor, skip.end);
  }

  if (cursor < sourceDuration) {
    splitBySpeed(cursor, sourceDuration);
  }

  return segments;
}

export function snapMediaTimeToPlayable(
  mediaTime: number,
  skipRegions: MediaSkipRegion[],
  sourceDuration: number,
): number {
  const skips = normalizeSkipRegions(skipRegions);
  let time = Math.max(0, Math.min(sourceDuration, mediaTime));

  for (const skip of skips) {
    if (time >= skip.start && time < skip.end) {
      time = skip.end;
    }
  }

  return Math.min(time, sourceDuration);
}

export type {MediaSegment};
