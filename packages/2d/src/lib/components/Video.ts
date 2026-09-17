import {
  BBox,
  DependencyContext,
  MediaSkipRegion,
  MediaSpeedRegion,
  MediaTimeMapper,
  MediaZoomRegion,
  PlaybackState,
  SerializedVector2,
  SignalValue,
  SimpleSignal,
  clamp,
  isReactive,
  snapMediaTimeToPlayable,
  useLogger,
  useThread,
} from '@canvas-commons/core';
import {computed, initial, nodeName, signal} from '../decorators';
import {DesiredLength} from '../partials';
import {
  FULL_NORMALIZED_RECT,
  NormalizedRect,
  drawImage,
  normalizeMediaRect,
  resolveMediaSourceBBox,
  zoomAtTime,
} from '../utils';
import {Rect, RectProps} from './Rect';
import reactivePlaybackRate from './__logs__/reactive-playback-rate';

export interface VideoProps extends RectProps {
  /**
   * {@inheritDoc Video.src}
   */
  src?: SignalValue<string>;
  /**
   * {@inheritDoc Video.alpha}
   */
  alpha?: SignalValue<number>;
  /**
   * {@inheritDoc Video.smoothing}
   */
  smoothing?: SignalValue<boolean>;
  /**
   * {@inheritDoc Video.loop}
   */
  loop?: SignalValue<boolean>;
  /**
   * {@inheritDoc Video.playbackRate}
   */
  playbackRate?: number;
  /**
   * The starting time for this video in seconds.
   */
  time?: SignalValue<number>;
  /**
   * {@inheritDoc Video.frame}
   */
  frame?: NormalizedRect;
  /**
   * {@inheritDoc Video.zoom}
   */
  zoom?: NormalizedRect;
  /**
   * {@inheritDoc Video.skipRegions}
   */
  skipRegions?: MediaSkipRegion[];
  /**
   * {@inheritDoc Video.speedRegions}
   */
  speedRegions?: MediaSpeedRegion[];
  /**
   * {@inheritDoc Video.zoomRegions}
   */
  zoomRegions?: MediaZoomRegion[];
  /**
   * {@inheritDoc Video.muted}
   */
  muted?: SignalValue<boolean>;
  play?: boolean;
}

@nodeName('Video')
export class Video extends Rect {
  private static readonly pool: Record<string, HTMLVideoElement> = {};

  /**
   * The source of this video.
   *
   * @example
   * Using a local video:
   * ```tsx
   * import video from './example.mp4';
   * // ...
   * view.add(<Video src={video} />)
   * ```
   * Loading an image from the internet:
   * ```tsx
   * view.add(<Video src="https://example.com/video.mp4" />)
   * ```
   */
  @signal()
  declare public readonly src: SimpleSignal<string, this>;

  /**
   * The alpha value of this video.
   *
   * @remarks
   * Unlike opacity, the alpha value affects only the video itself, leaving the
   * fill, stroke, and children intact.
   */
  @initial(1)
  @signal()
  declare public readonly alpha: SimpleSignal<number, this>;

  /**
   * Whether the video should be smoothed.
   *
   * @remarks
   * When disabled, the video will be scaled using the nearest neighbor
   * interpolation with no smoothing. The resulting video will appear pixelated.
   *
   * @defaultValue true
   */
  @initial(true)
  @signal()
  declare public readonly smoothing: SimpleSignal<boolean, this>;

  /**
   * Whether this video should loop upon reaching the end.
   */
  @initial(false)
  @signal()
  declare public readonly loop: SimpleSignal<boolean, this>;

  /**
   * The rate at which the video plays, as multiples of the normal speed.
   *
   * @defaultValue 1
   */
  @initial(1)
  @signal()
  declare public readonly playbackRate: SimpleSignal<number, this>;

  /**
   * The normalized source region used as the outer crop of the video.
   *
   * @defaultValue `{x: 0, y: 0, width: 1, height: 1}`
   */
  @initial(FULL_NORMALIZED_RECT)
  @signal()
  declare public readonly frame: SimpleSignal<NormalizedRect, this>;

  /**
   * The normalized source region that should fill the node's frame.
   *
   * @remarks
   * The zoom region is intersected with {@link Video.frame} before being drawn.
   *
   * @defaultValue {@link Video.frame}
   */
  @initial(FULL_NORMALIZED_RECT)
  @signal()
  declare public readonly zoom: SimpleSignal<NormalizedRect, this>;

  /**
   * Source-time ranges that should be skipped during playback.
   */
  @initial([])
  @signal()
  declare public readonly skipRegions: SimpleSignal<MediaSkipRegion[], this>;

  /**
   * Source-time ranges that should play at custom rates.
   */
  @initial([])
  @signal()
  declare public readonly speedRegions: SimpleSignal<MediaSpeedRegion[], this>;

  /**
   * Source-time ranges that should use a custom zoom focus.
   *
   * @remarks
   * Outside these ranges, {@link Video.zoom} is used.
   */
  @initial([])
  @signal()
  declare public readonly zoomRegions: SimpleSignal<MediaZoomRegion[], this>;

  /**
   * Whether the video's audio track should be muted.
   *
   * @defaultValue false
   */
  @initial(false)
  @signal()
  declare public readonly muted: SimpleSignal<boolean, this>;

  @initial(0)
  @signal()
  declare protected readonly time: SimpleSignal<number, this>;

  @initial(false)
  @signal()
  declare protected readonly playing: SimpleSignal<boolean, this>;

  private lastTime = -1;

  public constructor({play, frame, zoom, ...props}: VideoProps) {
    super({
      ...props,
      frame: normalizeMediaRect(frame),
      zoom: normalizeMediaRect(zoom ?? frame),
    });
    if (play) {
      this.play();
    }
  }

  protected activeZoom(): NormalizedRect {
    return zoomAtTime(this.zoom(), this.zoomRegions(), this.getCurrentTime());
  }

  /**
   * {@inheritDoc Curve.completion}
   */
  public curveCompletion(): number {
    return super.completion();
  }

  public isPlaying(): boolean {
    return this.playing();
  }

  public getCurrentTime(): number {
    return this.clampTime(this.time());
  }

  public getDuration(): number {
    return this.video().duration;
  }

  public getTimelineDuration(): number {
    return this.mapper().timelineDuration;
  }

  protected override desiredSize(): SerializedVector2<DesiredLength> {
    const custom = super.desiredSize();
    if (custom.x === null && custom.y === null) {
      const video = this.video();
      const source = resolveMediaSourceBBox(
        this.frame(),
        this.activeZoom(),
        video.videoWidth,
        video.videoHeight,
      );
      return {
        x: source.width,
        y: source.height,
      };
    }

    return custom;
  }

  /**
   * The completion of this video in the range from 0 to 1.
   *
   * @remarks
   * To get the percentage of the stroke that's currently visible, use
   * {@link Video.curveCompletion} instead.
   */
  @computed()
  public override completion(): number {
    const mapper = this.mapper();
    const duration = mapper.timelineDuration;
    if (duration <= 0) {
      return 0;
    }

    const timeline = mapper.mediaToTimeline(this.getCurrentTime());
    return timeline / duration;
  }

  @computed()
  protected mapper(): MediaTimeMapper {
    const duration = this.video().duration;
    return new MediaTimeMapper(
      Number.isFinite(duration) ? duration : 0,
      this.skipRegions(),
      this.speedRegions(),
      this.playbackRate(),
    );
  }

  @computed()
  protected video(): HTMLVideoElement {
    const src = this.src();
    const key = `${this.key}/${src}`;
    let video = Video.pool[key];
    if (!video) {
      video = document.createElement('video');
      video.src = src;
      Video.pool[key] = video;
      this.lastTime = -1;
    }

    video.muted = this.muted();

    if (video.readyState < 2) {
      DependencyContext.collectPromise(
        new Promise<void>(resolve => {
          const listener = () => {
            resolve();
            video.removeEventListener('canplay', listener);
          };
          video.addEventListener('canplay', listener);
        }),
      );
    }

    return video;
  }

  @computed()
  protected seekedVideo(): HTMLVideoElement {
    const video = this.video();
    const time = this.clampTime(this.time());
    const activeRate = this.mapper().getActiveRateAtMediaTime(time);

    video.playbackRate = activeRate;

    if (!video.paused) {
      video.pause();
    }

    if (this.lastTime === time) {
      return video;
    }

    this.setCurrentTime(time);

    return video;
  }

  @computed()
  protected fastSeekedVideo(): HTMLVideoElement {
    const video = this.video();
    const time = this.clampTime(this.time());
    const activeRate = this.mapper().getActiveRateAtMediaTime(time);

    video.playbackRate = activeRate;

    if (this.lastTime === time) {
      return video;
    }

    const playing = this.playing() && time < video.duration && activeRate > 0;
    if (playing) {
      if (video.paused) {
        DependencyContext.collectPromise(video.play());
      }
    } else {
      if (!video.paused) {
        video.pause();
      }
    }

    if (Math.abs(video.currentTime - time) > 0.2) {
      this.setCurrentTime(time);
    } else if (!playing) {
      video.currentTime = time;
    }

    return video;
  }

  protected override draw(context: CanvasRenderingContext2D) {
    this.drawShape(context);
    const alpha = this.alpha();
    if (alpha > 0) {
      const playbackState = this.view().playbackState();
      const video =
        playbackState === PlaybackState.Playing ||
        playbackState === PlaybackState.Presenting
          ? this.fastSeekedVideo()
          : this.seekedVideo();

      const source = resolveMediaSourceBBox(
        this.frame(),
        this.activeZoom(),
        video.videoWidth,
        video.videoHeight,
      );
      const dest = BBox.fromSizeCentered(this.computedSize());
      context.save();
      context.clip(this.getPath());
      if (alpha < 1) {
        context.globalAlpha *= alpha;
      }
      context.imageSmoothingEnabled = this.smoothing();
      drawImage(context, video, source, dest);
      context.restore();
    }

    if (this.clip()) {
      context.clip(this.getPath());
    }

    this.drawChildren(context);
  }

  protected override applyFlex() {
    super.applyFlex();
    const video = this.video();
    const source = resolveMediaSourceBBox(
      this.frame(),
      this.activeZoom(),
      video.videoWidth,
      video.videoHeight,
    );
    const ratio = this.ratio() ?? source.width / source.height;
    this.yogaNode.setAspectRatio(ratio);
  }

  protected setCurrentTime(value: number) {
    const video = this.video();
    if (video.readyState < 2) return;

    video.currentTime = value;
    this.lastTime = value;
    if (video.seeking) {
      DependencyContext.collectPromise(
        new Promise<void>(resolve => {
          const listener = () => {
            resolve();
            video.removeEventListener('seeked', listener);
          };
          video.addEventListener('seeked', listener);
        }),
      );
    }
  }

  protected setPlaybackRate(playbackRate: number) {
    let value: number;
    if (isReactive(playbackRate)) {
      value = playbackRate();
      useLogger().warn({
        message: 'Invalid value set as the playback rate',
        remarks: reactivePlaybackRate,
        inspect: this.key,
        stack: new Error().stack,
      });
    } else {
      value = playbackRate;
    }
    this.playbackRate.context.setter(value);

    if (this.playing()) {
      if (value === 0) {
        this.pause();
      } else {
        this.bindPlayingTime();
      }
    }
  }

  public play() {
    this.playing(true);
    this.bindPlayingTime();
  }

  public pause() {
    this.playing(false);
    this.time.save();
    this.video().pause();
  }

  public seek(time: number) {
    const playing = this.playing();
    this.time(this.clampTime(time));
    if (playing) {
      this.play();
    } else {
      this.pause();
    }
  }

  public clampTime(time: number): number {
    const duration = this.video().duration;
    if (!Number.isFinite(duration) || duration <= 0) {
      return Math.max(0, time);
    }

    const snapped = snapMediaTimeToPlayable(time, this.skipRegions(), duration);

    if (this.loop()) {
      return snapped % duration;
    }

    return clamp(0, duration, snapped);
  }

  protected override collectAsyncResources() {
    super.collectAsyncResources();
    this.seekedVideo();
  }

  private bindPlayingTime() {
    const threadTime = useThread().time;
    const start = threadTime();
    // Capture the current media offset without resolving video duration yet —
    // the element may still be loading during scene recalculation.
    const mediaOffset = this.time();

    this.time(() => {
      const mapper = this.mapper();
      let timeline =
        mapper.mediaToTimeline(mediaOffset) + (threadTime() - start);
      const timelineDuration = mapper.timelineDuration;

      if (this.loop() && timelineDuration > 0) {
        timeline =
          ((timeline % timelineDuration) + timelineDuration) % timelineDuration;
      }

      const {mediaTime} = mapper.timelineToMedia(timeline);
      const duration = this.video().duration;
      if (!Number.isFinite(duration) || duration <= 0) {
        return mediaTime;
      }
      return clamp(0, duration, mediaTime);
    });
  }
}
