import {Audio, Scene2D, Video} from '@canvas-commons/2d';
import {
  DEFAULT_MEDIA_EASE,
  MediaTimeMapper,
  type MediaSkipRegion,
  type MediaSpeedRegion,
  type MediaZoomRegion,
} from '@canvas-commons/core';
import {
  useApplication,
  useCurrentScene,
  usePreviewSettings,
  useScenes,
} from '@canvas-commons/editor';
import {ReadonlySignal, Signal, useComputed, useSignal} from '@preact/signals';
import {ComponentChildren, createContext} from 'preact';
import {useContext, useEffect, useMemo, useRef} from 'preact/hooks';
import {NodeInspectorKey} from '../constants';
import {bakeMediaBuffer} from './bakeMediaBuffer';
import {collectMediaAssets} from './mediaAssets';
import {
  getMediaBuffer,
  hashMediaEditSettings,
  registerMediaBuffer,
  resolveOriginalMediaUrl,
} from './mediaBufferCache';
import {
  applyBufferToNode,
  readSettingsFromNode,
  reapplyRegisteredMediaBuffers,
} from './mediaNodeEdits';
import {getMediaEdit, hasMediaEdit, setMediaEdit} from './mediaStorage';
import type {MediaAsset, MediaEditSettings, MediaRegionKind} from './types';
import {DEFAULT_MEDIA_EDIT} from './types';
import {centeredZoomInset, frameAspect, snapRectToAspect} from './zoomAspect';

export type MediaBufferStatus =
  | {state: 'idle'}
  | {state: 'baking'; progress: number}
  | {state: 'ready'; updatedAt: number}
  | {state: 'error'; message: string};

interface MediaEditorState {
  assets: ReadonlySignal<MediaAsset[]>;
  selectedAsset: Signal<MediaAsset | null>;
  settings: Signal<MediaEditSettings>;
  duration: Signal<number>;
  currentTime: Signal<number>;
  playing: Signal<boolean>;
  selectedRegion: Signal<{kind: MediaRegionKind; index: number} | null>;
  bufferStatus: Signal<MediaBufferStatus>;
  selectAsset: (asset: MediaAsset | null) => void;
  updateSettings: (settings: MediaEditSettings) => void;
  saveCurrentAsset: () => void;
  loadFromSelectedNode: () => void;
  updateBuffer: () => Promise<void>;
  setCurrentTime: (time: number) => void;
  togglePlayback: () => void;
  seekToStart: () => void;
  seekToEnd: () => void;
  stepByFrames: (delta: number, fps: number) => void;
  addRegion: (
    kind: MediaRegionKind,
    start: number,
    end: number,
    rate?: number,
  ) => void;
  updateRegion: (
    kind: MediaRegionKind,
    index: number,
    patch: Partial<MediaSkipRegion & MediaSpeedRegion & MediaZoomRegion>,
  ) => void;
  removeRegion: (kind: MediaRegionKind, index: number) => void;
  mapper: ReadonlySignal<MediaTimeMapper>;
}

const MediaEditorContext = createContext<MediaEditorState | null>(null);

export function useMediaEditor() {
  const context = useContext(MediaEditorContext);
  if (!context) {
    throw new Error('useMediaEditor must be used within MediaEditorProvider');
  }
  return context;
}

const MIN_REGION = 0.01;

function normalizeRegion(
  current: {start: number; end: number},
  patch: Partial<{start: number; end: number}>,
  maxDuration: number,
) {
  let start = current.start;
  let end = current.end;

  if (patch.start !== undefined && patch.end !== undefined) {
    start = patch.start;
    end = patch.end;
    if (end < start) {
      [start, end] = [end, start];
    }
  } else if (patch.start !== undefined) {
    start = patch.start;
    end = Math.max(end, start + MIN_REGION);
  } else if (patch.end !== undefined) {
    end = patch.end;
    start = Math.min(start, end - MIN_REGION);
  }

  const limit = maxDuration > 0 ? maxDuration : Number.POSITIVE_INFINITY;
  start = Math.max(0, Math.min(limit - MIN_REGION, start));
  end = Math.max(start + MIN_REGION, Math.min(limit, end));
  return {start, end};
}

export function MediaEditorProvider({children}: {children: ComponentChildren}) {
  const {project, player, inspection} = useApplication();
  const scenes = useScenes();
  const currentScene = useCurrentScene();
  const previewSettings = usePreviewSettings();

  const projectRef = useRef(project);
  const playerRef = useRef(player);
  const scenesRef = useRef(scenes);
  const currentSceneRef = useRef(currentScene);
  const inspectionRef = useRef(inspection);
  const fpsRef = useRef(previewSettings.fps);
  projectRef.current = project;
  playerRef.current = player;
  scenesRef.current = scenes;
  currentSceneRef.current = currentScene;
  inspectionRef.current = inspection;
  fpsRef.current = previewSettings.fps;

  const selectedAsset = useSignal<MediaAsset | null>(null);
  const settings = useSignal<MediaEditSettings>({...DEFAULT_MEDIA_EDIT});
  const duration = useSignal(0);
  const currentTime = useSignal(0);
  const playing = useSignal(false);
  const selectedRegion = useSignal<{
    kind: MediaRegionKind;
    index: number;
  } | null>(null);
  const assets = useSignal<MediaAsset[]>([]);
  const bufferStatus = useSignal<MediaBufferStatus>({state: 'idle'});
  const bakeAbortRef = useRef<AbortController | null>(null);
  const reapplyAllBuffersRef = useRef<() => void>(() => undefined);

  const selectedNode = useComputed(() => {
    const {key, payload} = inspectionRef.current.value;
    const scene = currentSceneRef.current;
    if (key !== NodeInspectorKey || !(scene instanceof Scene2D)) {
      return null;
    }

    return (scene as Scene2D).getNode(payload as string);
  });

  const mapper = useComputed(
    () =>
      new MediaTimeMapper(
        duration.value,
        settings.value.skipRegions,
        settings.value.speedRegions,
        1,
      ),
  );

  useEffect(() => {
    assets.value = collectMediaAssets(scenes, player.audio.getSource());
  }, [scenes, player]);

  useEffect(() => {
    const asset = selectedAsset.value;
    if (!asset) {
      duration.value = 0;
      return;
    }

    const element =
      asset.kind === 'video'
        ? document.createElement('video')
        : document.createElement('audio');
    element.preload = 'metadata';
    element.src = asset.url;

    const handleLoaded = () => {
      duration.value = Number.isFinite(element.duration) ? element.duration : 0;
    };

    element.addEventListener('loadedmetadata', handleLoaded);
    if (element.readyState >= 1) {
      handleLoaded();
    }

    return () => {
      element.removeEventListener('loadedmetadata', handleLoaded);
      element.src = '';
    };
  }, [selectedAsset.value?.url]);

  const state = useMemo<MediaEditorState>(() => {
    const syncBufferStatus = (url: string | undefined) => {
      if (!url) {
        bufferStatus.value = {state: 'idle'};
        return;
      }
      const buffer = getMediaBuffer(url);
      bufferStatus.value = buffer
        ? {state: 'ready', updatedAt: buffer.updatedAt}
        : {state: 'idle'};
    };

    const updateSettings = (next: MediaEditSettings) => {
      settings.value = next;
      const asset = selectedAsset.value;
      if (asset) {
        setMediaEdit(projectRef.current.name, asset.url, next);
      }
    };

    const selectAsset = (asset: MediaAsset | null) => {
      if (selectedAsset.value?.url) {
        setMediaEdit(
          projectRef.current.name,
          selectedAsset.value.url,
          settings.value,
        );
      }

      selectedAsset.value = asset;
      selectedRegion.value = null;
      playing.value = false;
      currentTime.value = 0;

      if (!asset) {
        settings.value = {...DEFAULT_MEDIA_EDIT};
        duration.value = 0;
        syncBufferStatus(undefined);
        return;
      }

      settings.value = getMediaEdit(projectRef.current.name, asset.url);
      syncBufferStatus(asset.url);
    };

    const saveCurrentAsset = () => {
      if (!selectedAsset.value) {
        return;
      }
      setMediaEdit(
        projectRef.current.name,
        selectedAsset.value.url,
        settings.value,
      );
    };

    const loadFromSelectedNode = () => {
      const node = selectedNode.value;
      if (!node) {
        return;
      }

      const nodeSettings = readSettingsFromNode(node);
      if (!nodeSettings) {
        return;
      }

      updateSettings(nodeSettings);

      let url: string | undefined;
      if (node instanceof Video || node instanceof Audio) {
        url = node.src();
      }

      const asset = url
        ? assets.value.find(
            item =>
              item.url === url || item.url === resolveOriginalMediaUrl(url),
          )
        : undefined;
      if (asset) {
        selectedAsset.value = asset;
        syncBufferStatus(asset.url);
      }
    };

    const applyBufferToReferences = (bufferUrl: string, asset: MediaAsset) => {
      for (const reference of asset.references) {
        const targetScene = scenesRef.current.find(
          item => item.name === reference.sceneName,
        );
        if (!targetScene || !(targetScene instanceof Scene2D)) {
          continue;
        }
        const node = (targetScene as Scene2D).getNode(reference.nodeKey);
        if (node) {
          applyBufferToNode(node, bufferUrl);
        }
      }
      playerRef.current.requestRender();
      assets.value = collectMediaAssets(
        scenesRef.current,
        playerRef.current.audio.getSource(),
      );
    };

    const reapplyAllBuffers = () => {
      if (reapplyRegisteredMediaBuffers(scenesRef.current)) {
        playerRef.current.requestRender();
        assets.value = collectMediaAssets(
          scenesRef.current,
          playerRef.current.audio.getSource(),
        );
      }
    };
    reapplyAllBuffersRef.current = reapplyAllBuffers;

    const updateBuffer = async () => {
      const asset = selectedAsset.value;
      if (!asset || asset.kind !== 'video') {
        return;
      }
      if (duration.value <= 0) {
        bufferStatus.value = {
          state: 'error',
          message: 'Source media duration is unavailable.',
        };
        return;
      }

      bakeAbortRef.current?.abort();
      const controller = new AbortController();
      bakeAbortRef.current = controller;

      const hash = hashMediaEditSettings(settings.value);

      bufferStatus.value = {state: 'baking', progress: 0};
      saveCurrentAsset();

      try {
        const result = await bakeMediaBuffer({
          sourceUrl: asset.url,
          settings: settings.value,
          sourceDuration: duration.value,
          fps: fpsRef.current || 30,
          signal: controller.signal,
          onProgress: progress => {
            bufferStatus.value = {state: 'baking', progress};
          },
        });

        // Apply before register so nodes never briefly hold a revoked blob URL.
        applyBufferToReferences(result.blobUrl, asset);
        registerMediaBuffer(asset.url, result.blobUrl, hash);
        bufferStatus.value = {
          state: 'ready',
          updatedAt: Date.now(),
        };
      } catch (error) {
        if (controller.signal.aborted) {
          syncBufferStatus(asset.url);
          return;
        }
        bufferStatus.value = {
          state: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'Failed to update media buffer.',
        };
      } finally {
        if (bakeAbortRef.current === controller) {
          bakeAbortRef.current = null;
        }
      }
    };

    const setCurrentTime = (time: number) => {
      currentTime.value = Math.max(0, Math.min(duration.value || 0, time));
    };

    const togglePlayback = () => {
      playing.value = !playing.value;
    };

    const seekToStart = () => {
      playing.value = false;
      setCurrentTime(0);
    };

    const seekToEnd = () => {
      playing.value = false;
      setCurrentTime(duration.value || 0);
    };

    const stepByFrames = (delta: number, fps: number) => {
      playing.value = false;
      const step = fps > 0 ? 1 / fps : 1 / 30;
      setCurrentTime(currentTime.value + delta * step);
    };

    const addRegion = (
      kind: MediaRegionKind,
      start: number,
      end: number,
      rate = 2,
    ) => {
      const normalized = normalizeRegion(
        {start, end},
        {start, end},
        duration.value,
      );
      if (normalized.end <= normalized.start) {
        return;
      }

      const next = {
        ...settings.value,
        skipRegions: [...settings.value.skipRegions],
        speedRegions: [...settings.value.speedRegions],
        zoomRegions: [...settings.value.zoomRegions],
      };

      if (kind === 'skip') {
        next.skipRegions.push(normalized);
        next.skipRegions.sort((a, b) => a.start - b.start);
        const index = next.skipRegions.findIndex(
          region =>
            region.start === normalized.start && region.end === normalized.end,
        );
        selectedRegion.value = {kind, index: Math.max(0, index)};
      } else if (kind === 'speed') {
        next.speedRegions.push({
          ...normalized,
          rate,
          easeIn: DEFAULT_MEDIA_EASE,
          easeOut: DEFAULT_MEDIA_EASE,
        });
        next.speedRegions.sort((a, b) => a.start - b.start);
        const index = next.speedRegions.findIndex(
          region =>
            region.start === normalized.start &&
            region.end === normalized.end &&
            region.rate === rate,
        );
        selectedRegion.value = {kind, index: Math.max(0, index)};
      } else {
        const frame = settings.value.frame;
        const rect = centeredZoomInset(frame);
        next.zoomRegions.push({
          ...normalized,
          rect,
          easeIn: DEFAULT_MEDIA_EASE,
          easeOut: DEFAULT_MEDIA_EASE,
        });
        next.zoomRegions.sort((a, b) => a.start - b.start);
        const index = next.zoomRegions.findIndex(
          region =>
            region.start === normalized.start && region.end === normalized.end,
        );
        selectedRegion.value = {kind, index: Math.max(0, index)};
      }

      updateSettings(next);
    };

    const updateRegion = (
      kind: MediaRegionKind,
      index: number,
      patch: Partial<MediaSkipRegion & MediaSpeedRegion & MediaZoomRegion>,
    ) => {
      const next = {
        ...settings.value,
        skipRegions: [...settings.value.skipRegions],
        speedRegions: [...settings.value.speedRegions],
        zoomRegions: [...settings.value.zoomRegions],
      };

      if (kind === 'skip') {
        const current = next.skipRegions[index];
        if (!current) {
          return;
        }
        next.skipRegions[index] = normalizeRegion(
          current,
          patch,
          duration.value,
        );
      } else if (kind === 'speed') {
        const current = next.speedRegions[index];
        if (!current) {
          return;
        }
        next.speedRegions[index] = {
          ...current,
          ...normalizeRegion(current, patch, duration.value),
          rate: Math.max(0.1, patch.rate ?? current.rate),
          easeIn: Math.max(
            0,
            patch.easeIn ?? current.easeIn ?? DEFAULT_MEDIA_EASE,
          ),
          easeOut: Math.max(
            0,
            patch.easeOut ?? current.easeOut ?? DEFAULT_MEDIA_EASE,
          ),
        };
      } else {
        const current = next.zoomRegions[index];
        if (!current) {
          return;
        }
        const nextRect = patch.rect
          ? snapRectToAspect(
              patch.rect,
              frameAspect(settings.value.frame),
              settings.value.frame,
            )
          : {...current.rect};
        next.zoomRegions[index] = {
          ...current,
          ...normalizeRegion(current, patch, duration.value),
          rect: nextRect,
          easeIn: Math.max(
            0,
            patch.easeIn ?? current.easeIn ?? DEFAULT_MEDIA_EASE,
          ),
          easeOut: Math.max(
            0,
            patch.easeOut ?? current.easeOut ?? DEFAULT_MEDIA_EASE,
          ),
        };
      }

      updateSettings(next);
    };

    const removeRegion = (kind: MediaRegionKind, index: number) => {
      const next = {
        ...settings.value,
        skipRegions: [...settings.value.skipRegions],
        speedRegions: [...settings.value.speedRegions],
        zoomRegions: [...settings.value.zoomRegions],
      };
      if (kind === 'skip') {
        next.skipRegions = next.skipRegions.filter(
          (_, regionIndex) => regionIndex !== index,
        );
      } else if (kind === 'speed') {
        next.speedRegions = next.speedRegions.filter(
          (_, regionIndex) => regionIndex !== index,
        );
      } else {
        next.zoomRegions = next.zoomRegions.filter(
          (_, regionIndex) => regionIndex !== index,
        );
      }
      selectedRegion.value = null;
      updateSettings(next);
    };

    return {
      assets,
      selectedAsset,
      settings,
      duration,
      currentTime,
      playing,
      selectedRegion,
      bufferStatus,
      selectAsset,
      updateSettings,
      saveCurrentAsset,
      loadFromSelectedNode,
      updateBuffer,
      setCurrentTime,
      togglePlayback,
      seekToStart,
      seekToEnd,
      stepByFrames,
      addRegion,
      updateRegion,
      removeRegion,
      mapper,
    };
  }, []);

  useEffect(() => {
    const asset = selectedAsset.value;
    if (!asset || asset.references.length === 0) {
      return;
    }

    if (hasMediaEdit(project.name, asset.url)) {
      return;
    }

    const reference = asset.references[0];
    const targetScene = scenes.find(item => item.name === reference.sceneName);
    if (!targetScene || !(targetScene instanceof Scene2D)) {
      return;
    }

    const node = (targetScene as Scene2D).getNode(reference.nodeKey);
    if (!node) {
      return;
    }

    const nodeSettings = readSettingsFromNode(node);
    if (
      nodeSettings &&
      (nodeSettings.skipRegions.length > 0 ||
        nodeSettings.speedRegions.length > 0 ||
        nodeSettings.zoomRegions.length > 0)
    ) {
      state.updateSettings(nodeSettings);
    }
  }, [selectedAsset.value?.url, assets.value, scenes, state, project.name]);

  useEffect(() => {
    if (!playing.value || duration.value <= 0) {
      return;
    }

    let frameId = 0;
    let lastTimestamp = performance.now();

    const tick = (timestamp: number) => {
      const delta = (timestamp - lastTimestamp) / 1000;
      lastTimestamp = timestamp;
      const timeline = mapper.value.mediaToTimeline(currentTime.value) + delta;
      const mapped = mapper.value.timelineToMedia(timeline);
      currentTime.value = mapped.mediaTime;

      if (timeline >= mapper.value.timelineDuration) {
        playing.value = false;
        return;
      }

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [
    playing.value,
    duration.value,
    settings.value,
    mapper,
    currentTime,
    playing,
  ]);

  useEffect(() => {
    const list = assets.value;
    if (list.length === 0) {
      selectedAsset.value = null;
      return;
    }

    if (
      !selectedAsset.value ||
      !list.some(asset => asset.url === selectedAsset.value?.url)
    ) {
      state.selectAsset(list[0]);
    }
  }, [assets.value, selectedAsset, state]);

  useEffect(() => {
    const unsubscribeScenes = scenes.map(scene =>
      scene.onReset.subscribe(() => {
        // onReset fires before GeneratorScene finishes await next(), so nodes
        // from the scene generator are not registered yet. Defer until after.
        setTimeout(() => {
          reapplyAllBuffersRef.current();
        }, 0);
      }),
    );
    const unsubscribeRecalculated = player.onRecalculated.subscribe(() => {
      reapplyAllBuffersRef.current();
    });
    reapplyAllBuffersRef.current();

    return () => {
      for (const unsubscribe of unsubscribeScenes) {
        unsubscribe();
      }
      unsubscribeRecalculated();
    };
  }, [scenes, player]);

  useEffect(() => {
    return () => {
      bakeAbortRef.current?.abort();
    };
  }, []);

  return (
    <MediaEditorContext.Provider value={state}>
      {children}
    </MediaEditorContext.Provider>
  );
}
