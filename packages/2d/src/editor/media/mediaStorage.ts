import {DEFAULT_MEDIA_EASE} from '@canvas-commons/core';
import type {MediaEditSettings} from './types';
import {DEFAULT_MEDIA_EDIT} from './types';

type MediaEditStore = Record<string, MediaEditSettings>;

function storageKey(projectName: string) {
  return `${projectName}-media-edits`;
}

function withEaseDefaults<T extends {easeIn?: number; easeOut?: number}>(
  region: T,
): T {
  return {
    ...region,
    easeIn: region.easeIn ?? DEFAULT_MEDIA_EASE,
    easeOut: region.easeOut ?? DEFAULT_MEDIA_EASE,
  };
}

export function loadMediaEdits(projectName: string): MediaEditStore {
  try {
    const raw = localStorage.getItem(storageKey(projectName));
    if (!raw) {
      return {};
    }

    return JSON.parse(raw) as MediaEditStore;
  } catch {
    return {};
  }
}

export function saveMediaEdits(
  projectName: string,
  store: MediaEditStore,
): void {
  localStorage.setItem(storageKey(projectName), JSON.stringify(store));
}

export function getMediaEdit(
  projectName: string,
  url: string,
): MediaEditSettings {
  const store = loadMediaEdits(projectName);
  const stored = store[url];
  if (!stored) {
    return {...DEFAULT_MEDIA_EDIT};
  }

  return {
    ...DEFAULT_MEDIA_EDIT,
    ...stored,
    frame: stored.frame ?? DEFAULT_MEDIA_EDIT.frame,
    zoom: stored.zoom ?? DEFAULT_MEDIA_EDIT.zoom,
    skipRegions: stored.skipRegions ?? [],
    speedRegions: (stored.speedRegions ?? []).map(withEaseDefaults),
    zoomRegions: (stored.zoomRegions ?? []).map(withEaseDefaults),
  };
}

export function hasMediaEdit(projectName: string, url: string): boolean {
  const store = loadMediaEdits(projectName);
  return Object.prototype.hasOwnProperty.call(store, url);
}

export function setMediaEdit(
  projectName: string,
  url: string,
  settings: MediaEditSettings,
): void {
  const store = loadMediaEdits(projectName);
  store[url] = settings;
  saveMediaEdits(projectName, store);
}
