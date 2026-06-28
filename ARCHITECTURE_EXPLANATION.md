# Canvas Commons UI Architecture

The Canvas Commons UI architecture relies on a few key systems to coordinate editing, timeline viewing, and the scene graph rendering.

## Packages breakdown

- **`@canvas-commons/editor`**: Contains the core Preact user interface. It manages layout, sidebars, the console, timeline, and rendering the `<Viewport>`. It utilizes `@preact/signals` heavily for UI state management.
- **`@canvas-commons/2d/src/editor`**: The 2D rendering package injects its own tools (e.g. `SceneGraphTab`, `NodeInspector`) directly into the editor via the `makeEditorPlugin` function. It builds an `EditorPlugin` interface containing custom tabs, overlays, and shortcut configurations.
- **`@canvas-commons/core`**: Implements the mathematical scene execution graph, event handlers, time manipulation, project metadata, and manages the lifecycle of nodes using JavaScript Generator functions. This runtime provides its own, separate signal system (e.g. `createSignal`) primarily used to coordinate real-time programmatic animation values.

## Editor Plugin Interface

Plugins integrate into the main UI using a strict configuration object (`EditorPlugin`), enabling features to expand via `PluginTabConfig` (to add sidebar tabs) and `PluginOverlayConfig` (to draw right over the HTML5 `<canvas>` viewport).

For example, to register a tab, a plugin implements `PluginTabConfig`:
```tsx
export const MyTabConfig: PluginTabConfig = {
  name: 'my-custom-tab',
  tabComponent: ({tab}) => <Tab title="My Custom Tool" tab={tab}><MyIcon /></Tab>,
  paneComponent: () => <Pane title="Tool details">My options go here</Pane>
};
```

This ensures new architectural additions (like a Storyboard viewer or a Compositor tool) can safely reside within the visual layout without modifying root editor navigation.

## Future Plans

The requested features (Storyboard parsing for `.mdmath`, Compositor panels, Component Scenes) are highly sophisticated modifications. Placing stub panels using `PluginTabConfig` into the `@canvas-commons/2d` editor plugin serves as an architectural foothold for when the user clarifies specifications and details regarding the markdown math parsing and independent animation rendering systems.
