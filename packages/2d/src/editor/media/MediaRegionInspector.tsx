import {DEFAULT_MEDIA_EASE} from '@canvas-commons/core';
import {Group, Label, NumberInput} from '@canvas-commons/editor';
import styles from './MediaEditor.module.scss';
import {useMediaEditor} from './MediaEditorContext';

/**
 * Compact inspector for the selected speed/zoom region in the bottom workspace.
 */
export function MediaRegionInspector() {
  const {settings, selectedRegion, updateRegion} = useMediaEditor();
  const selected = selectedRegion.value;
  if (!selected || (selected.kind !== 'speed' && selected.kind !== 'zoom')) {
    return null;
  }

  const speed =
    selected.kind === 'speed'
      ? settings.value.speedRegions[selected.index]
      : null;
  const zoom =
    selected.kind === 'zoom'
      ? settings.value.zoomRegions[selected.index]
      : null;
  if (!speed && !zoom) {
    return null;
  }

  const easeIn = speed?.easeIn ?? zoom?.easeIn ?? DEFAULT_MEDIA_EASE;
  const easeOut = speed?.easeOut ?? zoom?.easeOut ?? DEFAULT_MEDIA_EASE;

  return (
    <div className={styles.regionInspector}>
      <span className={styles.regionInspectorLabel}>
        {selected.kind === 'speed' ? 'Speed region' : 'Zoom region'}
      </span>
      {speed && (
        <Group>
          <Label>Rate</Label>
          <NumberInput
            value={speed.rate}
            min={0.1}
            step={0.1}
            decimalPlaces={2}
            onChange={value =>
              updateRegion(selected.kind, selected.index, {rate: value})
            }
          />
        </Group>
      )}
      <Group>
        <Label>Ease in</Label>
        <NumberInput
          value={easeIn}
          min={0}
          step={0.05}
          decimalPlaces={2}
          onChange={value =>
            updateRegion(selected.kind, selected.index, {easeIn: value})
          }
        />
      </Group>
      <Group>
        <Label>Ease out</Label>
        <NumberInput
          value={easeOut}
          min={0}
          step={0.05}
          decimalPlaces={2}
          onChange={value =>
            updateRegion(selected.kind, selected.index, {easeOut: value})
          }
        />
      </Group>
    </div>
  );
}
