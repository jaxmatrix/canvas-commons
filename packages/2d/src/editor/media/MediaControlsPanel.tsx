import {
  Button,
  Expandable,
  Group,
  Label,
  NumberInput,
  Select,
  Separator,
} from '@canvas-commons/editor';
import styles from './MediaEditor.module.scss';
import {useMediaEditor} from './MediaEditorContext';
import {applyZoomField, frameAspect, snapRectToAspect} from './zoomAspect';

export function MediaControlsPanel() {
  const {
    assets,
    selectedAsset,
    settings,
    selectedRegion,
    duration,
    currentTime,
    bufferStatus,
    selectAsset,
    updateSettings,
    updateRegion,
    addRegion,
    loadFromSelectedNode,
    updateBuffer,
    removeRegion,
  } = useMediaEditor();

  const asset = selectedAsset.value;
  const isVideo = asset?.kind === 'video';
  const selected = selectedRegion.value;
  const mediaDuration = duration.value;
  const status = bufferStatus.value;
  const baking = status.state === 'baking';

  const updateFrameField = (
    field: 'x' | 'y' | 'width' | 'height',
    value: number,
  ) => {
    const frame = {
      ...settings.value.frame,
      [field]: value,
    };
    const aspect = frameAspect(frame);
    updateSettings({
      ...settings.value,
      frame,
      zoom: snapRectToAspect(settings.value.zoom, aspect, frame),
      zoomRegions: settings.value.zoomRegions.map(region => ({
        ...region,
        rect: snapRectToAspect(region.rect, aspect, frame),
      })),
    });
  };

  const updateZoomField = (
    field: 'x' | 'y' | 'width' | 'height',
    value: number,
  ) => {
    updateSettings({
      ...settings.value,
      zoom: applyZoomField(
        settings.value.zoom,
        field,
        value,
        settings.value.frame,
      ),
    });
  };

  const selectedSkip =
    selected?.kind === 'skip'
      ? settings.value.skipRegions[selected.index]
      : null;
  const selectedSpeed =
    selected?.kind === 'speed'
      ? settings.value.speedRegions[selected.index]
      : null;
  const selectedZoom =
    selected?.kind === 'zoom'
      ? settings.value.zoomRegions[selected.index]
      : null;

  const assetOptions =
    assets.value.length === 0
      ? [{value: '', text: 'No media assets'}]
      : assets.value.map(item => ({
          value: item.url,
          text: `${item.label} (${item.kind})`,
        }));

  const addAtPlayhead = (kind: 'skip' | 'speed' | 'zoom') => {
    const start = Math.min(currentTime.value, Math.max(0, mediaDuration - 0.5));
    const end = Math.min(mediaDuration, start + 0.5);
    if (kind === 'skip') {
      addRegion('skip', start, end);
    } else if (kind === 'speed') {
      addRegion('speed', start, end, 2);
    } else {
      addRegion('zoom', start, end);
    }
  };

  return (
    <div className={styles.controls}>
      <Group>
        <Label>Asset</Label>
        <Select
          title="Media asset"
          value={asset?.url ?? ''}
          options={assetOptions}
          onChange={url => {
            const next = assets.value.find(item => item.url === url);
            selectAsset(next ?? null);
          }}
        />
      </Group>

      {asset && (
        <div className={styles.referenceList}>
          Used in {asset.references.length} place
          {asset.references.length === 1 ? '' : 's'}
        </div>
      )}

      <p className={styles.hint}>
        Play in the viewport to verify zoom, speed, and ease. Pause to place the
        zoom box. Drag Skip / Speed / Zoom tracks to edit regions, then press
        Update buffer to bake into the normal timeline.
      </p>

      <Group>
        <Label />
        <Button onClick={() => addAtPlayhead('skip')}>
          Add skip at playhead
        </Button>
      </Group>
      <Group>
        <Label />
        <Button onClick={() => addAtPlayhead('speed')}>
          Add speed at playhead
        </Button>
      </Group>
      {isVideo && (
        <Group>
          <Label />
          <Button onClick={() => addAtPlayhead('zoom')}>
            Add zoom at playhead
          </Button>
        </Group>
      )}

      {isVideo && (
        <>
          <Expandable title="Frame" open>
            <RectFields
              rect={settings.value.frame}
              onChange={updateFrameField}
            />
          </Expandable>
          <Expandable title="Zoom" open>
            <p className={styles.hint}>Zoom aspect matches the frame.</p>
            <RectFields rect={settings.value.zoom} onChange={updateZoomField} />
          </Expandable>
        </>
      )}

      {(selectedSkip || selectedSpeed || selectedZoom) && selected && (
        <Expandable title={`Selected ${selected.kind} region`} open>
          <Group>
            <Label>Start (s)</Label>
            <NumberInput
              value={
                selectedSkip?.start ??
                selectedSpeed?.start ??
                selectedZoom?.start ??
                0
              }
              min={0}
              max={mediaDuration > 0 ? mediaDuration : undefined}
              step={0.05}
              decimalPlaces={3}
              onChange={value =>
                updateRegion(selected.kind, selected.index, {start: value})
              }
            />
          </Group>
          <Group>
            <Label>End (s)</Label>
            <NumberInput
              value={
                selectedSkip?.end ??
                selectedSpeed?.end ??
                selectedZoom?.end ??
                0
              }
              min={0}
              max={mediaDuration > 0 ? mediaDuration : undefined}
              step={0.05}
              decimalPlaces={3}
              onChange={value =>
                updateRegion(selected.kind, selected.index, {end: value})
              }
            />
          </Group>
          {selectedSpeed && (
            <Group>
              <Label>Rate</Label>
              <NumberInput
                value={selectedSpeed.rate}
                min={0.1}
                step={0.1}
                decimalPlaces={2}
                onChange={value =>
                  updateRegion(selected.kind, selected.index, {rate: value})
                }
              />
            </Group>
          )}
          {selectedZoom && (
            <RectFields
              rect={selectedZoom.rect}
              onChange={(field, value) =>
                updateRegion(selected.kind, selected.index, {
                  rect: applyZoomField(
                    selectedZoom.rect,
                    field,
                    value,
                    settings.value.frame,
                  ),
                })
              }
            />
          )}
          {(selectedSpeed || selectedZoom) && (
            <>
              <Group>
                <Label>Ease in (s)</Label>
                <NumberInput
                  value={selectedSpeed?.easeIn ?? selectedZoom?.easeIn ?? 0.25}
                  min={0}
                  step={0.05}
                  decimalPlaces={2}
                  onChange={value =>
                    updateRegion(selected.kind, selected.index, {
                      easeIn: value,
                    })
                  }
                />
              </Group>
              <Group>
                <Label>Ease out (s)</Label>
                <NumberInput
                  value={
                    selectedSpeed?.easeOut ?? selectedZoom?.easeOut ?? 0.25
                  }
                  min={0}
                  step={0.05}
                  decimalPlaces={2}
                  onChange={value =>
                    updateRegion(selected.kind, selected.index, {
                      easeOut: value,
                    })
                  }
                />
              </Group>
            </>
          )}
          <Group>
            <Label />
            <Button onClick={() => removeRegion(selected.kind, selected.index)}>
              Remove region
            </Button>
          </Group>
        </Expandable>
      )}

      <Separator />

      <div className={styles.actions}>
        <Group>
          <Label />
          <Button onClick={loadFromSelectedNode}>
            Load from selected node
          </Button>
        </Group>
        <Group>
          <Label />
          <Button
            main
            disabled={!isVideo || baking || !asset}
            onClick={() => {
              void updateBuffer();
            }}
          >
            {baking
              ? `Updating buffer… ${Math.round(status.progress * 100)}%`
              : 'Update buffer'}
          </Button>
        </Group>
        <div className={styles.bufferStatus}>
          {status.state === 'idle' &&
            'Timeline uses the original video until you update the buffer.'}
          {status.state === 'baking' &&
            `Baking low-res preview… ${Math.round(status.progress * 100)}%`}
          {status.state === 'ready' &&
            `Buffer ready · ${new Date(status.updatedAt).toLocaleTimeString()}`}
          {status.state === 'error' && status.message}
        </div>
      </div>
    </div>
  );
}

function RectFields({
  rect,
  onChange,
}: {
  rect: {x: number; y: number; width: number; height: number};
  onChange: (field: 'x' | 'y' | 'width' | 'height', value: number) => void;
}) {
  return (
    <>
      {(['x', 'y', 'width', 'height'] as const).map(field => (
        <Group key={field}>
          <Label>{field}</Label>
          <NumberInput
            value={rect[field]}
            min={0}
            max={1}
            step={0.01}
            decimalPlaces={2}
            onChange={value => onChange(field, value)}
          />
        </Group>
      ))}
    </>
  );
}
