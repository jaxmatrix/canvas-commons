import './index.css';

import {makeEditorPlugin} from '@canvas-commons/editor';
import {CompositorTabConfig} from './CompositorTabConfig';
import {NodeInspectorConfig} from './NodeInspectorConfig';
import {PreviewOverlayConfig} from './PreviewOverlayConfig';
import {Provider} from './Provider';
import {SceneGraphTabConfig} from './SceneGraphTabConfig';
import {StoryboardTabConfig} from './StoryboardTabConfig';
import {SCENE_GRAPH_SHORTCUTS} from './shortcuts';

export default makeEditorPlugin(() => {
  return {
    name: '@canvas-commons/2d',
    provider: Provider,
    previewOverlay: PreviewOverlayConfig,
    tabs: [SceneGraphTabConfig, StoryboardTabConfig, CompositorTabConfig],
    inspectors: [NodeInspectorConfig],
    shortcuts: [SCENE_GRAPH_SHORTCUTS],
  };
});
