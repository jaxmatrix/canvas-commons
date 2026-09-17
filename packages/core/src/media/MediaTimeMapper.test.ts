import {describe, expect, test} from 'vitest';
import {rateAtMediaTime} from './MediaRegion';
import {MediaTimeMapper} from './MediaTimeMapper';

describe('MediaTimeMapper', () => {
  test('maps timeline linearly without regions', () => {
    const mapper = new MediaTimeMapper(10);

    expect(mapper.timelineDuration).toBe(10);
    expect(mapper.timelineToMedia(3)).toEqual({mediaTime: 3, activeRate: 1});
    expect(mapper.mediaToTimeline(3)).toBe(3);
  });

  test('skips source ranges', () => {
    const mapper = new MediaTimeMapper(10, [{start: 2, end: 4}]);

    expect(mapper.timelineDuration).toBe(8);
    expect(mapper.timelineToMedia(2)).toEqual({mediaTime: 2, activeRate: 1});
    expect(mapper.timelineToMedia(2.5)).toEqual({
      mediaTime: 4.5,
      activeRate: 1,
    });
    expect(mapper.mediaToTimeline(5)).toBe(3);
  });

  test('applies speed regions', () => {
    const mapper = new MediaTimeMapper(
      10,
      [],
      [{start: 0, end: 4, rate: 2, easeIn: 0, easeOut: 0}],
    );

    expect(mapper.timelineDuration).toBe(8);
    expect(mapper.timelineToMedia(1)).toEqual({mediaTime: 2, activeRate: 2});
    expect(mapper.timelineToMedia(3)).toEqual({mediaTime: 5, activeRate: 1});
    expect(mapper.timelineToMedia(5)).toEqual({mediaTime: 7, activeRate: 1});
  });

  test('combines skip and speed regions', () => {
    const mapper = new MediaTimeMapper(
      10,
      [{start: 2, end: 4}],
      [{start: 4, end: 8, rate: 2, easeIn: 0, easeOut: 0}],
    );

    expect(mapper.timelineDuration).toBe(6);
    expect(mapper.timelineToMedia(2)).toEqual({mediaTime: 2, activeRate: 1});
    expect(mapper.timelineToMedia(3)).toEqual({mediaTime: 6, activeRate: 2});
    expect(mapper.mediaToTimeline(7)).toBe(3.5);
  });

  test('respects the base playback rate', () => {
    const mapper = new MediaTimeMapper(10, [], [], 0.5);

    expect(mapper.timelineDuration).toBe(20);
    expect(mapper.timelineToMedia(4)).toEqual({mediaTime: 2, activeRate: 0.5});
  });

  test('snaps seeks inside skipped ranges forward', () => {
    const mapper = new MediaTimeMapper(10, [{start: 2, end: 4}]);

    expect(mapper.mediaToTimeline(3)).toBe(2);
    expect(mapper.getActiveRateAtMediaTime(3)).toBe(1);
  });

  test('round-trips media and timeline positions', () => {
    const mapper = new MediaTimeMapper(
      12,
      [{start: 3, end: 5}],
      [{start: 6, end: 10, rate: 2, easeIn: 0, easeOut: 0}],
      1.25,
    );

    for (const timeline of [0, 1.5, 4, 6.25]) {
      const {mediaTime} = mapper.timelineToMedia(timeline);
      expect(mapper.mediaToTimeline(mediaTime)).toBeCloseTo(timeline, 5);
    }
  });

  test('eases speed into the target rate', () => {
    const regions = [{start: 0, end: 4, rate: 2, easeIn: 1, easeOut: 0}];
    expect(rateAtMediaTime(regions, 0)).toBeCloseTo(1, 5);
    expect(rateAtMediaTime(regions, 0.5)).toBeGreaterThan(1);
    expect(rateAtMediaTime(regions, 0.5)).toBeLessThan(2);
    expect(rateAtMediaTime(regions, 1)).toBeCloseTo(2, 5);
    expect(rateAtMediaTime(regions, 2)).toBeCloseTo(2, 5);

    const mapper = new MediaTimeMapper(4, [], regions);
    expect(mapper.timelineDuration).toBeGreaterThan(2);
    expect(mapper.timelineDuration).toBeLessThan(4);
    expect(mapper.getActiveRateAtMediaTime(0.5)).toBeGreaterThan(1);
    expect(mapper.getActiveRateAtMediaTime(0.5)).toBeLessThan(2);
  });

  test('eases speed out of the target rate', () => {
    const regions = [{start: 0, end: 4, rate: 2, easeIn: 0, easeOut: 1}];
    expect(rateAtMediaTime(regions, 3)).toBeCloseTo(2, 5);
    expect(rateAtMediaTime(regions, 3.5)).toBeGreaterThan(1);
    expect(rateAtMediaTime(regions, 3.5)).toBeLessThan(2);
    expect(rateAtMediaTime(regions, 3.999)).toBeCloseTo(1, 1);
  });
});
