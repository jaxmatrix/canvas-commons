import {
  drawImage,
  normalizedToPixelBBox,
  resolveMediaSourceBBox,
  zoomAtTime,
} from '@canvas-commons/2d';
import {BBox, MediaTimeMapper} from '@canvas-commons/core';
import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  QUALITY_LOW,
  canEncodeVideo,
  getFirstEncodableAudioCodec,
} from 'mediabunny';
import type {MediaEditSettings} from './types';

const MAX_LONG_EDGE = 480;
const AUDIO_BITRATE = 128_000;
const AUDIO_SAMPLE_RATE = 48000;

export interface BakeMediaBufferOptions {
  sourceUrl: string;
  settings: MediaEditSettings;
  sourceDuration: number;
  fps: number;
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
}

export interface BakeMediaBufferResult {
  blobUrl: string;
  width: number;
  height: number;
  duration: number;
  frameCount: number;
}

/**
 * Bake media-editor edits into a low-resolution intermediate MP4.
 */
export async function bakeMediaBuffer(
  options: BakeMediaBufferOptions,
): Promise<BakeMediaBufferResult> {
  if (typeof VideoEncoder === 'undefined') {
    throw new Error(
      'WebCodecs VideoEncoder is not available in this browser. ' +
        'Use a recent Chromium or Firefox build to update the media buffer.',
    );
  }

  const fps = Math.max(1, Math.min(60, options.fps || 30));
  const mapper = new MediaTimeMapper(
    options.sourceDuration,
    options.settings.skipRegions,
    options.settings.speedRegions,
    1,
  );
  const timelineDuration = mapper.timelineDuration;
  if (timelineDuration <= 0) {
    throw new Error('Nothing to bake: timeline duration is zero.');
  }

  const video = await loadVideo(options.sourceUrl);
  try {
    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;
    if (sourceWidth <= 0 || sourceHeight <= 0) {
      throw new Error('Source video has no dimensions.');
    }

    const framePixels = normalizedToPixelBBox(
      options.settings.frame,
      sourceWidth,
      sourceHeight,
    );
    const {width, height} = fitEvenSize(
      Math.max(2, framePixels.width),
      Math.max(2, framePixels.height),
      MAX_LONG_EDGE,
    );

    if (!(await canEncodeVideo('avc', {width, height, bitrate: QUALITY_LOW}))) {
      throw new Error(
        `Cannot encode a ${width}×${height} preview buffer in this browser.`,
      );
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not create a 2D canvas context for baking.');
    }

    const output = new Output({
      format: new Mp4OutputFormat({fastStart: 'in-memory'}),
      target: new BufferTarget(),
    });
    const videoSource = new CanvasSource(canvas, {
      codec: 'avc',
      bitrate: QUALITY_LOW,
      keyFrameInterval: 2,
      latencyMode: 'realtime',
    });
    output.addVideoTrack(videoSource, {frameRate: fps});

    const remappedAudio = await tryRemapAudio(
      options.sourceUrl,
      mapper,
      options.signal,
    );
    let audioSource: AudioBufferSource | null = null;
    if (remappedAudio) {
      const codec = await getFirstEncodableAudioCodec(['aac', 'opus'], {
        numberOfChannels: remappedAudio.numberOfChannels,
        sampleRate: remappedAudio.sampleRate,
        bitrate: AUDIO_BITRATE,
      });
      if (codec) {
        audioSource = new AudioBufferSource({
          codec,
          bitrate: AUDIO_BITRATE,
        });
        output.addAudioTrack(audioSource);
      }
    }

    await output.start();

    const frameCount = Math.max(1, Math.ceil(timelineDuration * fps));
    const dest = new BBox(0, 0, width, height);

    for (let frame = 0; frame < frameCount; frame++) {
      throwIfAborted(options.signal);
      const timelineTime = frame / fps;
      const {mediaTime} = mapper.timelineToMedia(timelineTime);
      await seekVideo(video, mediaTime);

      const activeZoom = zoomAtTime(
        options.settings.zoom,
        options.settings.zoomRegions,
        mediaTime,
      );
      const source = resolveMediaSourceBBox(
        options.settings.frame,
        activeZoom,
        sourceWidth,
        sourceHeight,
      );

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);
      if (source.width > 0 && source.height > 0) {
        drawImage(ctx, video, source, dest);
      }

      await videoSource.add(timelineTime, 1 / fps);
      options.onProgress?.((frame + 1) / frameCount);
    }

    if (audioSource && remappedAudio) {
      await audioSource.add(remappedAudio);
    }

    await output.finalize();
    const buffer = output.target.buffer;
    if (!buffer) {
      throw new Error('Bake produced an empty buffer.');
    }

    const blobUrl = URL.createObjectURL(
      new Blob([buffer], {type: 'video/mp4'}),
    );

    return {
      blobUrl,
      width,
      height,
      duration: timelineDuration,
      frameCount,
    };
  } finally {
    video.removeAttribute('src');
    video.load();
  }
}

function fitEvenSize(
  sourceWidth: number,
  sourceHeight: number,
  maxLongEdge: number,
): {width: number; height: number} {
  const scale = Math.min(1, maxLongEdge / Math.max(sourceWidth, sourceHeight));
  let width = Math.max(2, Math.round(sourceWidth * scale));
  let height = Math.max(2, Math.round(sourceHeight * scale));
  if (width % 2 !== 0) {
    width += 1;
  }
  if (height % 2 !== 0) {
    height += 1;
  }
  return {width, height};
}

function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';

    const onLoaded = () => {
      cleanup();
      resolve(video);
    };
    const onError = () => {
      cleanup();
      reject(new Error(`Failed to load video for baking: ${url}`));
    };
    const cleanup = () => {
      video.removeEventListener('loadeddata', onLoaded);
      video.removeEventListener('error', onError);
    };

    video.addEventListener('loadeddata', onLoaded);
    video.addEventListener('error', onError);
    video.src = url;
  });
}

function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  const target = Math.max(0, Math.min(video.duration || time, time));
  if (Math.abs(video.currentTime - target) < 0.001) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('Failed to seek while baking media buffer.'));
    };
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
    };

    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    video.currentTime = target;
  });
}

async function tryRemapAudio(
  sourceUrl: string,
  mapper: MediaTimeMapper,
  signal?: AbortSignal,
): Promise<AudioBuffer | null> {
  try {
    throwIfAborted(signal);
    const response = await fetch(sourceUrl);
    if (!response.ok) {
      return null;
    }
    const data = await response.arrayBuffer();
    throwIfAborted(signal);
    const audioContext = new AudioContext({sampleRate: AUDIO_SAMPLE_RATE});
    try {
      const decoded = await audioContext.decodeAudioData(data.slice(0));
      return remapAudioBuffer(decoded, mapper, AUDIO_SAMPLE_RATE);
    } finally {
      await audioContext.close().catch(() => undefined);
    }
  } catch {
    return null;
  }
}

function remapAudioBuffer(
  source: AudioBuffer,
  mapper: MediaTimeMapper,
  sampleRate: number,
): AudioBuffer {
  const length = Math.max(1, Math.ceil(mapper.timelineDuration * sampleRate));
  const channels = source.numberOfChannels;
  const context = new OfflineAudioContext(channels, length, sampleRate);
  const output = context.createBuffer(channels, length, sampleRate);

  for (let channel = 0; channel < channels; channel++) {
    const input = source.getChannelData(channel);
    const dest = output.getChannelData(channel);
    for (let index = 0; index < length; index++) {
      const timelineTime = index / sampleRate;
      const {mediaTime} = mapper.timelineToMedia(timelineTime);
      const sourceIndex = mediaTime * source.sampleRate;
      const left = Math.floor(sourceIndex);
      if (left < 0 || left >= input.length) {
        dest[index] = 0;
        continue;
      }
      const right = Math.min(left + 1, input.length - 1);
      const frac = sourceIndex - left;
      dest[index] = input[left] * (1 - frac) + input[right] * frac;
    }
  }

  return output;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException('Baking aborted', 'AbortError');
  }
}
