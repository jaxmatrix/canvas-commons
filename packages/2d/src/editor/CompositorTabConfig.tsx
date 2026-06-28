import {
  Grid,
  Pane,
  PluginTabConfig,
  PluginTabProps,
  Tab,
} from '@canvas-commons/editor';

function TabComponent({tab}: PluginTabProps) {
  return (
    <Tab
      title="Compositor"
      id="compositor-tab"
      tab={tab}
    >
      <Grid />
    </Tab>
  );
}

function PaneComponent() {
  return (
    <Pane
      title="Compositor"
      id="compositor-pane"
    >
      <div>
        <p>This is a placeholder for the compositor feature to generate independent animations and map to demo shapes.</p>
      </div>
    </Pane>
  );
}

export const CompositorTabConfig: PluginTabConfig = {
  name: 'compositor',
  tabComponent: TabComponent,
  paneComponent: PaneComponent,
};
