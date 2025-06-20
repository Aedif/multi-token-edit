import { MODULE_ID } from '../constants';
import ScenescapeConfig from '../scenescape/configuration';

export function registerSceneConfigHooks() {
  Hooks.on('renderSceneConfig', (app, html, options) => {
    const blackBars = app.document.getFlag(MODULE_ID, 'blackBars');
    const element = $(`
    <div class="form-group">
        <label>Scenescape</label>
        <div class="form-fields">
            <button  class="configureScenescape" type="button" data-tooltip="Configure Scenescape">
              <i class="fa-regular fa-mountain-sun"></i>
            </button>
        </div>
        <p class="hint">Configure this scene as a 'Scenescape' allowing dynamic scaling and positioning of assets on a landscape background.</p>
    </div>
    <div class="form-group">
      <label>Black Bars</label>
      <div class="form-fields">
          <input type="checkbox" name="flags.${MODULE_ID}.blackBars" ${blackBars ? 'checked' : ''}/>
      </div>
      <p class="hint">Display black bars in the padded area of the scene.</p>
    </div>
            `);
    element.on('click', '.configureScenescape', () => new ScenescapeConfig().render(true));
    $(html).find('[name="initial.scale"]').closest('.form-group').after(element);
    app.setPosition({ height: 'auto' });
  });
}
