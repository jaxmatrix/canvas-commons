import {
  MediaSkipRegion,
  MediaSpeedRegion,
  MediaTimelinePosition,
  buildMediaSegments,
  normalizeSkipRegions,
  rateAtMediaTime,
  snapMediaTimeToPlayable,
  type MediaSegment,
} from './MediaRegion';

/**
 * Maps between scene timeline time and source media time while applying skip
 * and speed regions.
 *
 * @example
 * ```ts
 * const mapper = new MediaTimeMapper(10, [{start: 2, end: 4}], [{start: 0, end: 2, rate: 2}]);
 * mapper.timelineToMedia(1); // { mediaTime: 2, activeRate: 2 }
 * ```
 */
export class MediaTimeMapper {
  private readonly segments: MediaSegment[];
  private readonly skipRegions: MediaSkipRegion[];
  private readonly speedRegions: MediaSpeedRegion[];
  private readonly sourceDuration: number;

  public readonly timelineDuration: number;

  public constructor(
    sourceDuration: number,
    skipRegions: MediaSkipRegion[] = [],
    speedRegions: MediaSpeedRegion[] = [],
    private readonly baseRate = 1,
  ) {
    this.sourceDuration = Math.max(0, sourceDuration);
    this.skipRegions = normalizeSkipRegions(skipRegions);
    this.speedRegions = speedRegions
      .filter(region => region.end > region.start && region.rate > 0)
      .map(region => ({...region}));
    this.segments = buildMediaSegments(
      this.sourceDuration,
      this.skipRegions,
      this.speedRegions,
      this.baseRate,
    );
    this.timelineDuration =
      this.segments.length > 0
        ? this.segments[this.segments.length - 1].timelineEnd
        : 0;
  }

  /**
   * Convert a timeline position to a source media position.
   */
  public timelineToMedia(timelineTime: number): MediaTimelinePosition {
    if (this.segments.length === 0) {
      return {mediaTime: 0, activeRate: this.baseRate};
    }

    const timeline = this.clampTimeline(timelineTime);
    const segment = this.findSegmentAtTimeline(timeline);
    const elapsed = timeline - segment.timelineStart;
    const mediaTime =
      segment.sourceStart + elapsed * segment.rate * this.baseRate;

    return {
      mediaTime: Math.min(mediaTime, segment.sourceEnd),
      activeRate: segment.rate * this.baseRate,
    };
  }

  /**
   * Convert a source media position to the corresponding timeline position.
   */
  public mediaToTimeline(mediaTime: number): number {
    if (this.segments.length === 0) {
      return 0;
    }

    const time = snapMediaTimeToPlayable(
      mediaTime,
      this.skipRegions,
      this.sourceDuration,
    );

    for (const segment of this.segments) {
      if (time >= segment.sourceStart && time <= segment.sourceEnd) {
        const elapsed =
          (time - segment.sourceStart) / (segment.rate * this.baseRate);
        return segment.timelineStart + elapsed;
      }

      if (time < segment.sourceStart) {
        return segment.timelineStart;
      }
    }

    return this.timelineDuration;
  }

  /**
   * Get the effective playback rate at a source media position.
   */
  public getActiveRateAtMediaTime(mediaTime: number): number {
    const time = snapMediaTimeToPlayable(
      mediaTime,
      this.skipRegions,
      this.sourceDuration,
    );

    return rateAtMediaTime(this.speedRegions, time, 1) * this.baseRate;
  }

  private clampTimeline(timelineTime: number): number {
    if (this.timelineDuration <= 0) {
      return 0;
    }

    return Math.max(0, Math.min(this.timelineDuration, timelineTime));
  }

  private findSegmentAtTimeline(timelineTime: number): MediaSegment {
    for (const segment of this.segments) {
      if (
        timelineTime <= segment.timelineEnd ||
        segment === this.segments.at(-1)
      ) {
        return segment;
      }
    }

    return this.segments[this.segments.length - 1];
  }
}
