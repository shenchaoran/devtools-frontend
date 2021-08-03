import * as UI from '../../ui/legacy/legacy.js';

let customPanelInstace: CustomPanel;
export class CustomPanel extends UI.Panel.Panel {
  constructor() {
    super('custom');

    const iframe = document.createElement('iframe');
    iframe.setAttribute('src', '/extensions/memory.html');
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.overflow = 'auto';
    this.contentElement.appendChild(iframe);

    window.addEventListener(
      'message',
      (e) => {
        if (e.data === 'getParentUrl') {
          iframe.contentWindow?.postMessage(window.location.href, e.origin);
        }
      },
      false,
    );
  }

  static instance(opts = { forceNew: null }): CustomPanel {
    const { forceNew } = opts;
    if (!customPanelInstace || forceNew) {
      customPanelInstace = new CustomPanel();
    }

    return customPanelInstace;
  }
}
