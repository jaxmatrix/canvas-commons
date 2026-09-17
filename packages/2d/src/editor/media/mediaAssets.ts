import {Audio, Node, Scene2D, Video} from '@canvas-commons/2d';
import type {Scene} from '@canvas-commons/core';
import {resolveOriginalMediaUrl} from './mediaBufferCache';
import type {MediaAsset, MediaAssetKind, MediaAssetReference} from './types';

function walkNodes(node: Node, visit: (node: Node) => void) {
  visit(node);
  for (const child of node.children()) {
    walkNodes(child, visit);
  }
}

function addAsset(
  assets: Map<string, MediaAsset>,
  url: string,
  kind: MediaAssetKind,
  reference: MediaAssetReference,
) {
  if (!url) {
    return;
  }

  const label = url.split('/').pop() ?? url;
  const existing = assets.get(url);
  if (existing) {
    existing.references.push(reference);
    if (existing.kind !== kind) {
      existing.kind = 'video';
    }
    return;
  }

  assets.set(url, {
    url,
    label,
    kind,
    references: [reference],
  });
}

export function collectMediaAssets(
  scenes: Scene[],
  projectAudio?: string | null,
): MediaAsset[] {
  const assets = new Map<string, MediaAsset>();

  if (projectAudio) {
    addAsset(assets, projectAudio, 'audio', {
      sceneName: 'project',
      nodeKey: 'project-audio',
      kind: 'audio',
    });
  }

  for (const scene of scenes) {
    if (!(scene instanceof Scene2D)) {
      continue;
    }

    const view = (scene as Scene2D).getView();
    if (!view) {
      continue;
    }

    walkNodes(view, node => {
      if (node instanceof Video) {
        const url = resolveOriginalMediaUrl(node.src());
        addAsset(assets, url, 'video', {
          sceneName: scene.name,
          nodeKey: node.key,
          kind: 'video',
        });
      }

      if (node instanceof Audio) {
        addAsset(assets, node.src(), 'audio', {
          sceneName: scene.name,
          nodeKey: node.key,
          kind: 'audio',
        });
      }
    });
  }

  return [...assets.values()].sort((a, b) => a.label.localeCompare(b.label));
}
