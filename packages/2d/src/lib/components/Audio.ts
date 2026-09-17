import {
  DependencyContext,
  MediaSkipRegion,
  MediaSpeedRegion,
  MediaTimeMapper,
  PlaybackState,
  SignalValue,
  SimpleSignal,
  clamp,
  isReactive,
  snapMediaTimeToPlayable,
  useLogger,
  useThread,
} from '@canvas-commons/core';
import {computed, initial, nodeName, signal} from '../decorators';
import {Node, NodeProps} from './Node';
import reactivePlaybackRate from './__logs__/reactive-playback-rate';

export interface AudioProps extends NodeProps {
  /**
   * {@inheritDoc Audio.src}
   */
  src?: SignalValue<string>;
  /**
   * {@inheritDoc Audio.loop}
   */
  loop?: SignalValue<boolean>;
  /**
   * {@inheritDoc Audio.playbackRate}
   */
  playbackRate?: number;
  /**
   * The starting time for this audio clip in seconds.
   */
  time?: SignalValue<number>;
  /**
   * {@inheritDoc Audio.skipRegions}
   */
  skipRegions?: MediaSkipRegion[];
  /**
   * {@inheritDoc Audio.speedRegions}
   */
  speedRegions?: MediaSpeedRegion[];
  /**
   * {@inheritDoc Audio.volume}
   */
  volume?: SignalValue<number>;
  /**
   * {@inheritDoc Audio.muted}
   */
  muted?: SignalValue<boolean>;
  play?: boolean;
}

@nodeName('Audio')
export class Audio extends Node {
  private static readonly pool: Record<string, HTMLAudioElement> = {};

  /**
   * The source of this audio clip.
   *
   * @example
   * ```tsx
   * import clip from './example.mp4';
   * view.add(<Audio src={clip} />);
   * ```
   */
  @signal()
  declare public readonly src: SimpleSignal<string, this>;

  /**
   * Whether this audio clip should loop upon reaching the end.
   */
  @initial(false)
  @signal()
  declare public readonly loop: SimpleSignal<boolean, this>;

  /**
   * The rate at which the audio plays, as multiples of the normal speed.
   *
   * @defaultValue 1
   */
  @initial(1)
  @signal()
  declare public readonly playbackRate: SimpleSignal<number, this>;

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
   * The volume of this audio clip from 0 to 1.
   *
   * @defaultValue 1
   */
  @initial(1)
  @signal()
  declare public readonly volume: SimpleSignal<number, this>;

  /**
   * Whether this audio clip should be muted.
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

  public constructor({play, ...props}: AudioProps) {
    super(props);
    if (play) {
      this.play();
    }
  }

  public isPlaying(): boolean {
    return this.playing();
  }

  public getCurrentTime(): number {
    return this.clampTime(this.time());
  }

  public getDuration(): number {
    return this.audio().duration;
  }

  public getTimelineDuration(): number {
    return this.mapper().timelineDuration;
  }

  @computed()
  public completion(): number {
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
    const duration = this.audio().duration;
    return new MediaTimeMapper(
      Number.isFinite(duration) ? duration : 0,
      this.skipRegions(),
      this.speedRegions(),
      this.playbackRate(),
    );
  }

  @computed()
  protected audio(): HTMLAudioElement {
    const src = this.src();
    const key = `${this.key}/${src}`;
    let audio = Audio.pool[key];
    if (!audio) {
      audio = document.createElement('audio');
      audio.src = src;
      Audio.pool[key] = audio;
    }

    audio.volume = clamp(0, 1, this.volume());
    audio.muted = this.muted();

    if (audio.readyState < 2) {
      DependencyContext.collectPromise(
        new Promise<void>(resolve => {
          const listener = () => {
            resolve();
            audio.removeEventListener('canplay', listener);
          };
          audio.addEventListener('canplay', listener);
        }),
      );
    }

    return audio;
  }

  @computed()
  protected seekedAudio(): HTMLAudioElement {
    const audio = this.audio();
    const time = this.clampTime(this.time());
    const activeRate = this.mapper().getActiveRateAtMediaTime(time);

    audio.playbackRate = activeRate;

    if (!audio.paused) {
      audio.pause();
    }

    if (this.lastTime === time) {
      return audio;
    }

    this.setCurrentTime(time);

    return audio;
  }

  @computed()
  protected fastSeekedAudio(): HTMLAudioElement {
    const audio = this.audio();
    const time = this.clampTime(this.time());
    const activeRate = this.mapper().getActiveRateAtMediaTime(time);

    audio.playbackRate = activeRate;

    if (this.lastTime === time) {
      return audio;
    }

    const playing = this.playing() && time < audio.duration && activeRate > 0;
    if (playing) {
      if (audio.paused) {
        DependencyContext.collectPromise(audio.play());
      }
    } else if (!audio.paused) {
      audio.pause();
    }

    if (Math.abs(audio.currentTime - time) > 0.2) {
      this.setCurrentTime(time);
    } else if (!playing) {
      audio.currentTime = time;
    }

    return audio;
  }

  protected override draw(context: CanvasRenderingContext2D) {
    const playbackState = this.view().playbackState();
    if (
      playbackState === PlaybackState.Playing ||
      playbackState === PlaybackState.Presenting
    ) {
      this.fastSeekedAudio();
    } else {
      this.seekedAudio();
    }

    this.drawChildren(context);
  }

  protected setCurrentTime(value: number) {
    const audio = this.audio();
    if (audio.readyState < 2) {
      return;
    }

    audio.currentTime = value;
    this.lastTime = value;
    if (audio.seeking) {
      DependencyContext.collectPromise(
        new Promise<void>(resolve => {
          const listener = () => {
            resolve();
            audio.removeEventListener('seeked', listener);
          };
          audio.addEventListener('seeked', listener);
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
    this.audio().pause();
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
    const duration = this.audio().duration;
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
    this.seekedAudio();
  }

  private bindPlayingTime() {
    const threadTime = useThread().time;
    const start = threadTime();
    // Capture the current media offset without resolving audio duration yet —
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
      const duration = this.audio().duration;
      if (!Number.isFinite(duration) || duration <= 0) {
        return mediaTime;
      }
      return clamp(0, duration, mediaTime);
    });
  }
}
