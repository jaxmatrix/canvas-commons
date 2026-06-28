# Component Scene Architecture Design

To support "Component Scenes" (scenes that act as reusable components within the main scene), we must consider the fundamental constraints of `@canvas-commons/core`.

## Current Limitations

1. **Global Generators:** The current framework treats scenes as the top-level execution context. The runtime loop `await scene.next()` evaluates a single generator tree sequentially.
2. **Context Passing:** The `useScene()` hook expects exactly one active scene. Nesting scenes would require a scoped context or an updated `DependencyContext` capable of managing nested scene graphs.
3. **Signal Synchronization:** Core signals (`createSignal`) animate based on the active scene's time. A component scene would either need to inherit the parent scene's timeline or manage its own internal playback state that syncs with the parent.

## Proposed Architecture

To add Component Scenes, we need to introduce a new Node primitive, `SceneNode`, in `@canvas-commons/2d`.

```tsx
import {SceneNode} from '@canvas-commons/2d';
import myComponentScene from './myComponent?scene';

export default makeScene2D(function* (view) {
  view.add(
    <SceneNode scene={myComponentScene} />
  );

  yield* waitFor(1);
});
```

### Required Modifications

1. **`@canvas-commons/core` - `ThreadGenerator` Engine**
   The execution engine must allow a Node to spawn and track a child `Scene`. When `SceneNode` yields, it delegates execution to the internal component's generator.

2. **`@canvas-commons/2d` - `SceneNode` Implementation**
   This node must handle:
   - Instantiating a new `GeneratorScene` using the provided scene configuration.
   - Syncing its physical layout constraints (width, height, resolutionScale) to its child view.
   - Passing rendering events down to the child scene context: `childScene.render(context)`.

## Next Steps

Implementing this goes far beyond a UI change. It requires rewriting the `Scene` lifecycle logic in `GeneratorScene.ts` and adding new multi-scene orchestration to the internal player state. This document serves as the foundation for those future refactors.
