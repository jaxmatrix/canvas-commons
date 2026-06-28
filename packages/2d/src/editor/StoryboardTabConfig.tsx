import {
  OpenInNew,
  Pane,
  PluginTabConfig,
  PluginTabProps,
  Tab,
} from '@canvas-commons/editor';

function TabComponent({tab}: PluginTabProps) {
  return (
    <Tab
      title="Storyboard (.mdmath)"
      id="storyboard-tab"
      tab={tab}
    >
      <OpenInNew />
    </Tab>
  );
}

function PaneComponent() {
  return (
    <Pane
      title="Storyboard"
      id="storyboard-pane"
    >
      <div>
        <p>This is a placeholder for the `.mdmath` storyboard component.</p>
      </div>
    </Pane>
  );
}

export const StoryboardTabConfig: PluginTabConfig = {
  name: 'storyboard',
  tabComponent: TabComponent,
  paneComponent: PaneComponent,
};
