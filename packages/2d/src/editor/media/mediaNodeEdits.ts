import {
  Audio,
  FULL_NORMALIZED_RECT,
  Node,
  NormalizedRect,
  Scene2D,
  Video,
} from '@canvas-commons/2d';
import type {
  MediaSkipRegion,
  MediaSpeedRegion,
  MediaZoomRegion,
  Scene,
} from '@canvas-commons/core';
import {getMediaBuffer} from './mediaBufferCache';
import type {MediaEditSettings} from './types';

export function readSettingsFromNode(node: Node): MediaEditSettings | null {
  if (node instanceof Video) {
    return {
      frame: {...node.frame()},
      zoom: {...node.zoom()},
      skipRegions: node.skipRegions().map((region: MediaSkipRegion) => ({
        ...region,
      })),
      speedRegions: node.speedRegions().map((region: MediaSpeedRegion) => ({
        ...region,
      })),
      zoomRegions: node.zoomRegions().map((region: MediaZoomRegion) => ({
        ...region,
        rect: {...region.rect},
      })),
    };
  }

  if (node instanceof Audio) {
    return {
      frame: {x: 0, y: 0, width: 1, height: 1},
      zoom: {x: 0, y: 0, width: 1, height: 1},
      skipRegions: node.skipRegions().map((region: MediaSkipRegion) => ({
        ...region,
      })),
      speedRegions: node.speedRegions().map((region: MediaSpeedRegion) => ({
        ...region,
      })),
      zoomRegions: [],
    };
  }

  return null;
}

export function applySettingsToNode(
  node: Node,
  settings: MediaEditSettings,
): boolean {
  if (node instanceof Video) {
    node.frame({...settings.frame});
    node.zoom({...settings.zoom});
    node.skipRegions(cloneRegions(settings.skipRegions));
    node.speedRegions(cloneSpeedRegions(settings.speedRegions));
    node.zoomRegions(cloneZoomRegions(settings.zoomRegions));
    return true;
  }

  if (node instanceof Audio) {
    node.skipRegions(cloneRegions(settings.skipRegions));
    node.speedRegions(cloneSpeedRegions(settings.speedRegions));
    return true;
  }

  return false;
}

/**
 * Point a Video node at a baked buffer and clear live edit signals so the
 * ordinary renderer plays the intermediate file as-is.
 */
export function applyBufferToNode(node: Node, bufferUrl: string): boolean {
  if (!(node instanceof Video)) {
    return false;
  }

  node.src(bufferUrl);
  node.frame({...FULL_NORMALIZED_RECT});
  node.zoom({...FULL_NORMALIZED_RECT});
  node.skipRegions([]);
  node.speedRegions([]);
  node.zoomRegions([]);
  return true;
}

/**
 * Re-bind registered buffers onto Video nodes that still point at the original
 * source URL (e.g. after Scene2D.reset rebuilds the tree).
 */
export function reapplyRegisteredMediaBuffers(scenes: Scene[]): boolean {
  let applied = false;

  for (const scene of scenes) {
    if (!(scene instanceof Scene2D)) {
      continue;
    }

    const view = (scene as Scene2D).getView();
    if (!view) {
      continue;
    }

    walkNodes(view, node => {
      if (!(node instanceof Video)) {
        return;
      }

      const buffer = getMediaBuffer(node.src());
      if (!buffer) {
        return;
      }

      if (applyBufferToNode(node, buffer.url)) {
        applied = true;
      }
    });
  }

  return applied;
}

function walkNodes(node: Node, visit: (node: Node) => void) {
  visit(node);
  for (const child of node.children()) {
    walkNodes(child, visit);
  }
}

function cloneRegions(regions: MediaSkipRegion[]): MediaSkipRegion[] {
  return regions.map(region => ({...region}));
}

function cloneSpeedRegions(regions: MediaSpeedRegion[]): MediaSpeedRegion[] {
  return regions.map(region => ({...region}));
}

function cloneZoomRegions(regions: MediaZoomRegion[]): MediaZoomRegion[] {
  return regions.map(region => ({
    ...region,
    rect: {...region.rect},
  }));
}

export function applyFrameZoom(
  node: Node,
  frame: NormalizedRect,
  zoom: NormalizedRect,
) {
  if (node instanceof Video) {
    node.frame({...frame});
    node.zoom({...zoom});
    return true;
  }

  return false;
}
