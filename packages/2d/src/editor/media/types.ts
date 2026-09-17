import type {NormalizedRect} from '@canvas-commons/2d';
import {FULL_NORMALIZED_RECT} from '@canvas-commons/2d';
import type {
  MediaSkipRegion,
  MediaSpeedRegion,
  MediaZoomRegion,
} from '@canvas-commons/core';

export type MediaAssetKind = 'video' | 'audio';

export interface MediaAssetReference {
  sceneName: string;
  nodeKey: string;
  kind: MediaAssetKind;
}

export interface MediaAsset {
  url: string;
  label: string;
  kind: MediaAssetKind;
  references: MediaAssetReference[];
}

export interface MediaEditSettings {
  frame: NormalizedRect;
  zoom: NormalizedRect;
  skipRegions: MediaSkipRegion[];
  speedRegions: MediaSpeedRegion[];
  zoomRegions: MediaZoomRegion[];
}

export const DEFAULT_MEDIA_EDIT: MediaEditSettings = {
  frame: FULL_NORMALIZED_RECT,
  zoom: FULL_NORMALIZED_RECT,
  skipRegions: [],
  speedRegions: [],
  zoomRegions: [],
};

export type MediaRegionKind = 'skip' | 'speed' | 'zoom';
