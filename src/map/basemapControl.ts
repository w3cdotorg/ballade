import type maplibregl from 'maplibre-gl';

export interface Basemap {
  label: string;
  url: string;
}

/** Fonds OpenFreeMap (gratuits, sans clé) ; le premier est le défaut de createMap. */
export const BASEMAPS: Basemap[] = [
  { label: 'Liberty', url: 'https://tiles.openfreemap.org/styles/liberty' },
  { label: 'Bright', url: 'https://tiles.openfreemap.org/styles/bright' },
  { label: 'Positron', url: 'https://tiles.openfreemap.org/styles/positron' },
];

/** Contrôle « fonds de carte » façon openstreetmap.org : un bouton qui déplie la liste. */
export class BasemapControl implements maplibregl.IControl {
  private container!: HTMLDivElement;
  private current = BASEMAPS[0].url;

  constructor(private onChange: (url: string) => void) {}

  onAdd(): HTMLElement {
    this.container = document.createElement('div');
    this.container.className = 'maplibregl-ctrl basemap-ctrl';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'basemap-ctrl-toggle';
    toggle.title = 'Change the basemap';
    toggle.textContent = '⧉';
    const list = document.createElement('div');
    list.className = 'basemap-ctrl-list';
    list.hidden = true;
    for (const b of BASEMAPS) {
      const label = document.createElement('label');
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'basemap';
      radio.checked = b.url === this.current;
      radio.addEventListener('change', () => {
        if (this.current === b.url) return;
        this.current = b.url;
        this.onChange(b.url);
        list.hidden = true;
      });
      label.append(radio, document.createTextNode(` ${b.label}`));
      list.append(label);
    }
    toggle.addEventListener('click', () => {
      list.hidden = !list.hidden;
    });
    this.container.append(toggle, list);
    return this.container;
  }

  onRemove(): void {
    this.container.remove();
  }
}
