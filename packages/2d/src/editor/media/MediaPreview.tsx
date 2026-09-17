import {
  drawImage,
  resolveMediaSourceBBox,
  zoomAtTime,
} from '@canvas-commons/2d';
import {BBox, MediaTimeMapper} from '@canvas-commons/core';
import {useEffect, useRef, useState} from 'preact/hooks';
import {
  letterboxMediaDest,
  ZOOM_EDIT_LETTERBOX_INSET,
} from './letterboxMediaDest';
import styles from './MediaEditor.module.scss';
import {useMediaEditor} from './MediaEditorContext';
import {ZoomOverlay} from './ZoomOverlay';

const SEEK_JUMP_THRESHOLD = 0.35;

export function MediaPreview() {
  const {
    selectedAsset,
    settings,
    currentTime,
    playing,
    duration,
    selectedRegion,
    updateRegion,
  } = useMediaEditor();
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastRateRef = useRef(1);
  const wasPlayingRef = useRef(false);
  const [videoSize, setVideoSize] = useState({width: 0, height: 0});

  const asset = selectedAsset.value;
  const editingZoomPaused =
    !playing.value &&
    selectedRegion.value?.kind === 'zoom' &&
    selectedRegion.value.index >= 0 &&
    !!settings.value.zoomRegions[selectedRegion.value.index];
  const selectedZoomIndex =
    selectedRegion.value?.kind === 'zoom' ? selectedRegion.value.index : -1;
  const selectedZoomRect =
    selectedZoomIndex >= 0
      ? settings.value.zoomRegions[selectedZoomIndex]?.rect
      : null;

  const getElement = () => {
    if (!asset) {
      return null;
    }
    return asset.kind === 'video' ? videoRef.current : audioRef.current;
  };

  const paintFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!video || !canvas || !container) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    const rect = container.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);

    if (video.videoWidth <= 0 || video.videoHeight <= 0) {
      return;
    }

    if (
      videoSize.width !== video.videoWidth ||
      videoSize.height !== video.videoHeight
    ) {
      setVideoSize({width: video.videoWidth, height: video.videoHeight});
    }

    const showZoomEdit =
      !playing.peek() &&
      selectedRegion.peek()?.kind === 'zoom' &&
      selectedRegion.peek()?.index !== undefined &&
      !!settings.value.zoomRegions[selectedRegion.peek()!.index];

    if (showZoomEdit) {
      const dest = letterboxMediaDest(
        width,
        height,
        video.videoWidth / video.videoHeight,
        ZOOM_EDIT_LETTERBOX_INSET,
      );
      const fullSource = new BBox(0, 0, video.videoWidth, video.videoHeight);
      drawImage(
        ctx,
        video,
        fullSource,
        new BBox(dest.x, dest.y, dest.width, dest.height),
      );

      const frame = settings.value.frame;
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.rect(dest.x, dest.y, dest.width, dest.height);
      ctx.rect(
        dest.x + frame.x * dest.width,
        dest.y + frame.y * dest.height,
        frame.width * dest.width,
        frame.height * dest.height,
      );
      ctx.fill('evenodd');
      ctx.restore();
      return;
    }

    const activeZoom = zoomAtTime(
      settings.value.zoom,
      settings.value.zoomRegions,
      currentTime.value,
    );
    const source = resolveMediaSourceBBox(
      settings.value.frame,
      activeZoom,
      video.videoWidth,
      video.videoHeight,
    );
    if (source.width <= 0 || source.height <= 0) {
      return;
    }

    const dest = letterboxMediaDest(
      width,
      height,
      source.width / source.height,
    );
    drawImage(
      ctx,
      video,
      source,
      new BBox(dest.x, dest.y, dest.width, dest.height),
    );
  };

  useEffect(() => {
    const element = getElement();
    if (!element || !asset) {
      return;
    }

    element.src = asset.url;
    lastRateRef.current = 1;

    const handleLoaded = () => {
      if (Number.isFinite(element.duration) && element.duration > 0) {
        duration.value = element.duration;
      }
      element.currentTime = currentTime.value;
      if (asset.kind === 'video') {
        paintFrame();
      }
    };

    element.addEventListener('loadedmetadata', handleLoaded);
    if (element.readyState >= 1) {
      handleLoaded();
    }

    return () => {
      element.removeEventListener('loadedmetadata', handleLoaded);
    };
  }, [asset?.url, asset?.kind]);

  useEffect(() => {
    const element = getElement();
    if (!element) {
      return;
    }

    const starting = playing.value && !wasPlayingRef.current;
    wasPlayingRef.current = playing.value;

    if (playing.value) {
      if (starting) {
        element.currentTime = currentTime.value;
      }
      void element.play().catch(() => {
        playing.value = false;
      });
    } else {
      element.pause();
      element.currentTime = currentTime.value;
      if (asset?.kind === 'video') {
        paintFrame();
      }
    }
  }, [playing.value]);

  useEffect(() => {
    const element = getElement();
    if (!element || !asset) {
      return;
    }

    const mapper = new MediaTimeMapper(
      duration.value,
      settings.value.skipRegions,
      settings.value.speedRegions,
      1,
    );
    const activeRate = mapper.getActiveRateAtMediaTime(currentTime.value);
    if (activeRate !== lastRateRef.current) {
      lastRateRef.current = activeRate;
      element.playbackRate = activeRate;
    }

    if (!playing.peek()) {
      if (Math.abs(element.currentTime - currentTime.value) > 0.001) {
        element.currentTime = currentTime.value;
      }
      if (asset.kind === 'video') {
        paintFrame();
      }
      return;
    }

    if (
      Math.abs(element.currentTime - currentTime.value) > SEEK_JUMP_THRESHOLD
    ) {
      element.currentTime = currentTime.value;
    }
  }, [currentTime.value, settings.value, duration.value, asset?.kind]);

  useEffect(() => {
    if (asset?.kind !== 'video') {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!video || !canvas || !container) {
      return;
    }

    let frameId = 0;
    let disposed = false;

    const tick = () => {
      if (disposed) {
        return;
      }
      paintFrame();
      if (playing.value) {
        frameId = requestAnimationFrame(tick);
      }
    };

    paintFrame();
    if (playing.value) {
      frameId = requestAnimationFrame(tick);
    }

    const observer = new ResizeObserver(() => paintFrame());
    observer.observe(container);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, [
    asset?.kind,
    asset?.url,
    playing.value,
    editingZoomPaused,
    settings.value,
    currentTime.value,
  ]);

  if (!asset) {
    return (
      <div className={styles.viewportEmpty}>
        Select a media asset to preview.
      </div>
    );
  }

  if (asset.kind === 'audio') {
    return (
      <div className={styles.viewportPreview}>
        <audio ref={audioRef} className={styles.hiddenMedia} />
        <div className={styles.audioPreview}>
          <span>{asset.label}</span>
          <span>
            {formatTime(currentTime.value)} / {formatTime(duration.value)}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.viewportPreview} ref={containerRef}>
      <video ref={videoRef} className={styles.hiddenMedia} muted playsInline />
      <canvas ref={canvasRef} className={styles.previewCanvas} />
      {editingZoomPaused && selectedZoomRect && selectedZoomIndex >= 0 && (
        <ZoomOverlay
          videoWidth={videoSize.width}
          videoHeight={videoSize.height}
          frame={settings.value.frame}
          rect={selectedZoomRect}
          onChange={next =>
            updateRegion('zoom', selectedZoomIndex, {rect: next})
          }
        />
      )}
    </div>
  );
}

function formatTime(value: number) {
  if (!Number.isFinite(value)) {
    return '0:00';
  }

  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60)
    .toString()
    .padStart(2, '0');
  return `${minutes}:${seconds}`;
}
