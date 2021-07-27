import * as UI from '../../ui/legacy/legacy.js';


let customPanelInstace: CustomPanel;
export class CustomPanel extends UI.Panel.Panel {
  constructor() {
    super('custom');

    let _contentElement =  document.createElement("div");
    // 编写面板的具体内容
    _contentElement.innerText = 'testtesttest';
    this.element.appendChild(_contentElement);

  }

  static instance(opts = {forceNew: null}): CustomPanel {
    const {forceNew} = opts;
    if (!customPanelInstace || forceNew) {
      customPanelInstace = new CustomPanel();
    }

    return customPanelInstace;
  }
}
