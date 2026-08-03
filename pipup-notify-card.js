// pipup-notify-card.js
// PiPup Notification Card for Home Assistant
// Version: v2026.08.02.18

// Shared configuration definitions
const POSITIONS = {
  0: { label: 'Top-Right', icon: 'mdi:arrow-top-right' },
  1: { label: 'Top-Left', icon: 'mdi:arrow-top-left' },
  2: { label: 'Bottom-Right', icon: 'mdi:arrow-bottom-right' },
  3: { label: 'Bottom-Left', icon: 'mdi:arrow-bottom-left' },
  4: { label: 'Center', icon: 'mdi:arrow-expand' }
};

const POSITIONS_LIST = Object.entries(POSITIONS).map(([value, data]) => ({
  value: parseInt(value),
  ...data
}));

const COLORS = [
  { value: '#CC161616', label: 'Dark' },
  { value: '#CC000000', label: 'Black' },
  { value: '#CC2196F3', label: 'Blue' },
  { value: '#CC4CAF50', label: 'Green' },
  { value: '#CCF44336', label: 'Red' },
  { value: '#CCFF9800', label: 'Orange' },
  { value: '#CC9C27B0', label: 'Purple' },
  { value: '#CC009688', label: 'Teal' }
];

const TRANSPARENCY_OPTIONS = [
  { value: '00', label: '0%' },
  { value: '33', label: '20%' },
  { value: '66', label: '40%' },
  { value: '99', label: '60%' },
  { value: 'CC', label: '80%' },
  { value: 'FF', label: '100%' }
];

// Rich-notification (pipup.send) media/animation option lists
const MEDIA_POSITIONS = [
  { value: 0, label: 'Top' },
  { value: 1, label: 'Bottom' },
  { value: 2, label: 'Left' },
  { value: 3, label: 'Right' }
];

const TITLE_ALIGNMENTS = [
  { value: 0, label: 'Left' },
  { value: 1, label: 'Center' },
  { value: 2, label: 'Right' }
];

const ANIMATION_TYPES = [
  { value: 'none', label: 'None' },
  { value: 'fade', label: 'Fade' },
  { value: 'slide', label: 'Slide' },
  { value: 'scale', label: 'Scale' }
];

const BUILD_NUMBER = 'v2026.08.02.18';
let DEBUG = false;

function debugLog(...args) {
  if (DEBUG) console.log('[PiPup]', ...args);
}

// Strip user-selected substrings (e.g. "PiPup") out of a friendly name for display.
// stripStrings is a comma-separated string of words/phrases to remove, case-insensitive.
function stripName(name, stripStrings) {
  if (!name) return name;
  let result = name;
  const words = (stripStrings || '')
    .split(',')
    .map(w => w.trim())
    .filter(w => w.length > 0);
  words.forEach(w => {
    const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escaped, 'gi'), '');
  });
  // Collapse extra whitespace left behind by the removal
  return result.replace(/\s{2,}/g, ' ').trim();
}

// Dynamically discover PiPup TVs for the Visual Editor by walking the live
// entity/device registries - NEVER hardcode entity_ids or naming patterns.
// Matches each notify.* entity from the pipup platform to its device's
// connectivity binary_sensor via device_id + device_class, so it works no
// matter what HA happens to name the connectivity entity.
function discoverPipupTvs(hass) {
  if (!hass || !hass.states) return [];

  let notifyIds;
  let deviceLookup = null;

  if (hass.entities) {
    notifyIds = Object.values(hass.entities)
      .filter(e => e.platform === 'pipup' && e.entity_id.startsWith('notify.'))
      .map(e => e.entity_id);
    deviceLookup = Object.values(hass.entities);
  } else {
    // Registry not exposed to this card - fall back to a prefix scan
    notifyIds = Object.keys(hass.states).filter(id => id.startsWith('notify.pipup_'));
  }

  return notifyIds.map(entityId => {
    const state = hass.states[entityId];
    let friendlyName = state?.attributes?.friendly_name || entityId;
    let status = 'unknown';

    if (deviceLookup) {
      const reg = hass.entities[entityId];
      if (reg) {
        if (hass.devices && hass.devices[reg.device_id]) {
          const device = hass.devices[reg.device_id];
          friendlyName = device.name_by_user || device.name || friendlyName;
        }
        const connEntry = deviceLookup.find(e =>
          e.device_id === reg.device_id &&
          e.entity_id.startsWith('binary_sensor.') &&
          hass.states[e.entity_id]?.attributes?.device_class === 'connectivity'
        );
        if (connEntry) {
          const connState = hass.states[connEntry.entity_id];
          if (connState && connState.state !== 'unavailable' && connState.state !== 'unknown') {
            status = connState.state === 'on' ? 'online' : 'offline';
          }
        }
      }
    } else if (state) {
      status = (state.state === 'available' || state.state === 'on') ? 'online'
        : (state.state === 'unavailable' || state.state === 'off') ? 'offline' : 'unknown';
    }

    return { entityId, friendlyName, status };
  });
}

// ============ MAIN CARD CLASS ============
class PipupNotifyCard extends HTMLElement {
  static getStubConfig() {
    return {
      selected_devices: [],  // Array of device IDs to send to
      token: '',  // Optional auth token
      title: 'Home Assistant',
      default_message: 'Hello from PiPup!',
      default_duration: 10,
      default_position: 3,
      default_background_color: '#CC161616',
      default_transparency: 'CC',
      tts_enabled: false,
      interrupt_enabled: true,
      show_progress: true,
      show_entity_ids: false,  // Show/hide entity IDs on card
      corner_radius: 18,
      border_width: 2,
      border_color: '#2196F3',
      title_color: '#FFFFFF',
      // Button configuration
      button1_enabled: false,
      button1_label: '',
      button1_id: '',
      button2_enabled: false,
      button2_label: '',
      button2_id: '',
      button3_enabled: false,
      button3_label: '',
      button3_id: '',
      button_color: '#1565C0',
      // Comma-separated list of words/phrases stripped from displayed friendly names
      strip_strings: 'PiPup',
      // Rich notification media/animation defaults (pipup.send)
      default_media_width: 480,
      default_media_position: 2,       // 0 top · 1 bottom · 2 left · 3 right
      default_title_alignment: 0,      // 0 left · 1 center · 2 right
      default_animation_type: 'fade',  // none · fade · slide · scale
      default_animation_duration: 250,
      debug: false
    };
  }

  constructor() {
    super();
    debugLog('Constructor called');
    this._rendered = false;
    this._config = null;
    this._hass = null;
    this._editing = false;
    this._editorRendered = false;
    this._editorContainer = null;
    
    // State values
    this._message = '';
    this._imageUri = '';
    this._videoUri = '';
    this._duration = 10;
    this._position = 3;
    this._backgroundColor = '#CC161616';
    this._transparency = 'CC';
    this._tts = false;
    this._interrupt = true;
    this._showProgress = true;
    this._showEntityIds = false;
    this._button1Enabled = false;
    this._button1Label = '';
    this._button1Id = '';
    this._button2Enabled = false;
    this._button2Label = '';
    this._button2Id = '';
    this._button3Enabled = false;
    this._button3Label = '';
    this._button3Id = '';
    this._selectedDevices = [];
  }

  setConfig(config) {
    debugLog('setConfig called', config);
    if (!config) throw new Error('Invalid configuration');
    
    this._config = {
      ...PipupNotifyCard.getStubConfig(),
      ...config
    };
    
    this._selectedDevices = this._config.selected_devices || [];
    this._showEntityIds = this._config.show_entity_ids || false;
    DEBUG = this._config.debug || false;
    
    if (this._editing) {
      this.renderEditor();
    } else {
      this.renderCard();
    }
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._rendered) {
      this.renderCard();
      this._rendered = true;
      return;
    }
    if (!this._editing) {
      this.updateStates();
    }
  }

  getCardSize() {
    return 14;
  }

  // Helper to log to Home Assistant
  _logToHA(level, message) {
    if (!this._hass) return;
    try {
      this._hass.callService('system_log', 'write', {
        message: '[PiPup Card] ' + message,
        level: level
      }).catch(() => {});
    } catch (e) {}
    console.log('[PiPup]', message);
  }

  // Get all PiPup notify entities. Prefer the live entity registry (hass.entities),
  // which tags entities by integration/platform ("pipup") - this is accurate
  // regardless of how a given entity happens to be named. Fall back to a
  // notify.pipup_ prefix scan only if the registry isn't exposed to this card.
  _getPipupEntities() {
    if (!this._hass) return [];
    if (this._hass.entities) {
      const ids = Object.values(this._hass.entities)
        .filter(e => e.platform === 'pipup' && e.entity_id.startsWith('notify.'))
        .map(e => e.entity_id);
      return ids.map(id => this._hass.states[id]).filter(Boolean);
    }
    return Object.values(this._hass.states).filter(s =>
      s.entity_id.startsWith('notify.pipup_')
    );
  }

  // Get friendly name for a notify entity, straight from its current state/device -
  // never derived by string-manipulating the entity_id.
  _getFriendlyName(entityId) {
    if (!this._hass) return entityId;
    const state = this._hass.states[entityId];
    if (state && state.attributes && state.attributes.friendly_name) {
      return state.attributes.friendly_name;
    }
    if (this._hass.entities && this._hass.devices) {
      const reg = this._hass.entities[entityId];
      const device = reg && this._hass.devices[reg.device_id];
      if (device) return device.name_by_user || device.name || entityId;
    }
    return entityId;
  }

  // Find this notify entity's device, then find that device's connectivity
  // binary_sensor by device_class - not by guessing an entity_id pattern - so it
  // works no matter what HA happens to name the connectivity entity
  // (binary_sensor.connectivity, binary_sensor.connectivity_2, etc).
  _getDeviceStatus(entityId) {
    if (!this._hass) return 'unknown';

    if (this._hass.entities && this._hass.devices) {
      const reg = this._hass.entities[entityId];
      if (reg) {
        const connEntry = Object.values(this._hass.entities).find(e =>
          e.device_id === reg.device_id &&
          e.entity_id.startsWith('binary_sensor.') &&
          this._hass.states[e.entity_id]?.attributes?.device_class === 'connectivity'
        );
        if (connEntry) {
          const connState = this._hass.states[connEntry.entity_id];
          if (connState && connState.state !== 'unavailable' && connState.state !== 'unknown') {
            return connState.state === 'on' ? 'online' : 'offline';
          }
          return 'unknown';
        }
      }
    }

    // Fallback if the registry isn't available to this card: check the notify entity state
    const state = this._hass.states[entityId];
    if (!state) return 'unknown';

    if (state.state === 'available' || state.state === 'on') {
      return 'online';
    } else if (state.state === 'unavailable' || state.state === 'off') {
      return 'offline';
    }

    return 'unknown';
  }

  sendNotification() {
    // Get current values from UI
    const message = this._message || this._config.default_message;
    const duration = this._duration || this._config.default_duration;
    const position = this._position !== undefined ? this._position : this._config.default_position;
    const backgroundColor = this._backgroundColor || this._config.default_background_color;
    const transparency = this._transparency || this._config.default_transparency;
    const tts = this._tts !== undefined ? this._tts : this._config.tts_enabled;
    const interrupt = this._interrupt !== undefined ? this._interrupt : this._config.interrupt_enabled;
    const showProgress = this._showProgress !== undefined ? this._showProgress : this._config.show_progress;
    const imageUri = (this._imageUri || '').trim();
    const videoUri = (this._videoUri || '').trim();

    // Construct the background color with transparency
    const bgColor = backgroundColor.replace('CC', transparency);
    
    // Build the payload for pipup.send service - using correct field names
    const data = {
      title: this._config.title || 'Home Assistant',
      message: message,
      duration: duration,
      position: position,
      background_color: bgColor,
      title_color: this._config.title_color || '#FFFFFF',
      corner_radius: this._config.corner_radius || 18,
      border_color: this._config.border_color || '#2196F3',
      border_width: this._config.border_width || 2,
      show_progress: showProgress
    };

    // A live camera stream takes priority over a static image if both are set
    if (videoUri) {
      data.video_uri = videoUri;
    } else if (imageUri) {
      data.image_uri = imageUri;
    }
    if (imageUri || videoUri) {
      data.media_width = this._config.default_media_width || 480;
      data.media_position = this._config.default_media_position !== undefined ? this._config.default_media_position : 2;
    }
    data.title_alignment = this._config.default_title_alignment !== undefined ? this._config.default_title_alignment : 0;
    data.animation_type = this._config.default_animation_type || 'fade';
    data.animation_duration = this._config.default_animation_duration !== undefined ? this._config.default_animation_duration : 250;

    if (tts) {
      data.tts = message;
    }

    // Add buttons if enabled
    const buttons = [];
    if (this._button1Enabled && this._button1Label && this._button1Id) {
      buttons.push({ id: this._button1Id, label: this._button1Label });
    }
    if (this._button2Enabled && this._button2Label && this._button2Id) {
      buttons.push({ id: this._button2Id, label: this._button2Label });
    }
    if (this._button3Enabled && this._button3Label && this._button3Id) {
      buttons.push({ id: this._button3Id, label: this._button3Label });
    }
    
    if (buttons.length > 0) {
      data.buttons = buttons;
      if (this._config.button_color) {
        data.button_color = this._config.button_color;
      }
    }

    // Get selected devices from checkboxes
    const selectedDevices = this._selectedDevices.length > 0 
      ? this._selectedDevices 
      : this._config.selected_devices || [];

    if (selectedDevices.length === 0) {
      this.showError('❌ No devices selected! Check at least one TV.');
      return;
    }

    this._logToHA('info', 'Sending to devices: ' + selectedDevices.join(', '));
    this._logToHA('info', 'Payload: ' + JSON.stringify(data));

    if (!this._hass) {
      this.showError('❌ Home Assistant instance not available!');
      return;
    }

    // Check if pipup.send service exists
    if (!this._hass.services?.pipup?.send) {
      this._logToHA('error', 'pipup.send service not found! Install the PiPup integration.');
      this.showError('❌ pipup.send service not found! Install the PiPup integration.');
      return;
    }

    // Send to each selected device
    let successCount = 0;
    let errorCount = 0;
    const totalDevices = selectedDevices.length;

    const sendPromises = selectedDevices.map(entityId => {
      return this._hass.callService('pipup', 'send', data, { entity_id: entityId })
        .then(() => {
          successCount++;
          this._logToHA('info', 'Successfully sent to ' + entityId);
        })
        .catch(err => {
          errorCount++;
          console.error('[PiPup] Error sending to ' + entityId + ':', err);
          this._logToHA('error', 'Failed to send to ' + entityId + ': ' + (err.message || 'Unknown error'));
        });
    });

    Promise.all(sendPromises)
      .then(() => {
        if (errorCount === 0) {
          this.showSuccess(`✅ Notification sent to ${successCount} device${successCount > 1 ? 's' : ''}!`);
        } else {
          this.showError(`⚠️ Sent to ${successCount}/${totalDevices} devices. ${errorCount} failed. Check logs.`);
        }
      });
  }

  showError(message) {
    const errorDiv = this.querySelector('.pipup-error');
    if (errorDiv) {
      errorDiv.textContent = message;
      errorDiv.style.display = 'block';
      errorDiv.style.background = 'rgba(244, 67, 54, 0.1)';
      errorDiv.style.borderColor = '#f44336';
      errorDiv.style.color = '#f44336';
      this._logToHA('error', message);
      setTimeout(() => { errorDiv.style.display = 'none'; }, 10000);
    }
  }

  showSuccess(message) {
    const errorDiv = this.querySelector('.pipup-error');
    if (errorDiv) {
      errorDiv.textContent = message;
      errorDiv.style.display = 'block';
      errorDiv.style.background = 'rgba(76, 175, 80, 0.1)';
      errorDiv.style.borderColor = '#4CAF50';
      errorDiv.style.color = '#4CAF50';
      this._logToHA('info', message);
      setTimeout(() => { errorDiv.style.display = 'none'; }, 5000);
    }
  }

  renderCard() {
    if (!this._hass || !this._config) return;

    const container = document.createElement('div');
    container.className = 'pipup-wrap';
    
    const config = this._config;
    const message = this._message || config.default_message;
    const duration = this._duration || config.default_duration;
    const position = this._position !== undefined ? this._position : config.default_position;
    const backgroundColor = this._backgroundColor || config.default_background_color;
    const transparency = this._transparency || config.default_transparency;
    const tts = this._tts !== undefined ? this._tts : config.tts_enabled;
    const interrupt = this._interrupt !== undefined ? this._interrupt : config.interrupt_enabled;
    const showProgress = this._showProgress !== undefined ? this._showProgress : config.show_progress;
    const showEntityIds = this._showEntityIds !== undefined ? this._showEntityIds : config.show_entity_ids;

    // Get PiPup entities for checkboxes
    const pipupEntities = this._getPipupEntities();

    const styles = `
      <style>
        .pipup-wrap {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 8px 0;
          font-family: var(--ha-card-font-family, inherit);
        }
        .pipup-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 4px 8px;
        }
        .pipup-row-label {
          min-width: 80px;
          font-size: 14px;
          color: var(--secondary-text-color, #808080);
        }
        .pipup-row-value {
          flex: 1;
        }
        .pipup-row-value input,
        .pipup-row-value select {
          width: 100%;
          padding: 6px 10px;
          background: var(--secondary-background-color, #2a2a2a);
          border: 1px solid var(--divider-color, #333);
          border-radius: 6px;
          color: var(--primary-text-color, #e1e1e1);
          font-size: 14px;
          transition: border-color 0.2s;
        }
        .pipup-row-value input:focus,
        .pipup-row-value select:focus {
          border-color: #2196F3;
          outline: none;
        }
        .pipup-row-value select {
          cursor: pointer;
        }
        .pipup-send-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 12px 24px;
          margin: 8px 0;
          background: #2196F3;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          width: 100%;
        }
        .pipup-send-btn:hover {
          background: #1976D2;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(33, 150, 243, 0.3);
        }
        .pipup-send-btn:active {
          transform: translateY(0);
        }
        .pipup-send-btn ha-icon {
          width: 20px;
          height: 20px;
          --mdc-icon-size: 20px;
        }
        .pipup-toggle-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 4px 8px;
        }
        .pipup-toggle-row label {
          display: flex;
          align-items: center;
          gap: 6px;
          color: var(--primary-text-color, #e1e1e1);
          font-size: 14px;
          cursor: pointer;
        }
        .pipup-toggle-row input[type="checkbox"] {
          width: 18px;
          height: 18px;
          cursor: pointer;
          accent-color: #2196F3;
        }
        .pipup-error {
          display: none;
          padding: 8px 12px;
          border: 1px solid;
          border-radius: 6px;
          font-size: 14px;
          margin: 4px 8px;
          word-break: break-word;
        }
        .pipup-divider {
          border: none;
          border-top: 1px solid var(--divider-color, #333);
          margin: 4px 0;
        }
        .pipup-row-value .duration-unit {
          font-size: 13px;
          color: var(--secondary-text-color, #808080);
          margin-left: 4px;
        }
        .pipup-row-with-unit {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
        }
        .pipup-row-with-unit input {
          flex: 1;
        }
        .pipup-button-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 4px 8px;
        }
        .pipup-button-row-label {
          min-width: 80px;
          font-size: 14px;
          color: var(--secondary-text-color, #808080);
        }
        .pipup-button-group {
          display: flex;
          flex: 1;
          gap: 8px;
          flex-wrap: wrap;
          align-items: center;
        }
        .pipup-button-group input[type="text"] {
          flex: 1;
          min-width: 80px;
          padding: 6px 10px;
          background: var(--secondary-background-color, #2a2a2a);
          border: 1px solid var(--divider-color, #333);
          border-radius: 6px;
          color: var(--primary-text-color, #e1e1e1);
          font-size: 13px;
        }
        .pipup-button-group input[type="text"]:focus {
          border-color: #2196F3;
          outline: none;
        }
        .pipup-button-group input[type="text"]::placeholder {
          color: var(--secondary-text-color, #808080);
          font-size: 12px;
        }
        .pipup-button-group input[type="checkbox"] {
          width: 16px;
          height: 16px;
          cursor: pointer;
          accent-color: #2196F3;
          flex-shrink: 0;
        }
        .pipup-button-group label {
          display: flex;
          align-items: center;
          gap: 4px;
          color: var(--primary-text-color, #e1e1e1);
          font-size: 13px;
          cursor: pointer;
          white-space: nowrap;
        }
        .pipup-config-notice {
          padding: 8px 12px;
          background: rgba(255, 152, 0, 0.1);
          border: 1px solid #FF9800;
          border-radius: 6px;
          color: #FF9800;
          font-size: 13px;
          margin: 4px 8px;
        }
        .pipup-device-selector {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 4px 8px;
        }
        .pipup-device-selector-label {
          font-size: 14px;
          color: var(--secondary-text-color, #808080);
          margin-bottom: 4px;
        }
        .pipup-device-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 4px 8px;
          border-radius: 4px;
          transition: background 0.2s;
        }
        .pipup-device-item:hover {
          background: rgba(255, 255, 255, 0.05);
        }
        .pipup-device-item input[type="checkbox"] {
          width: 16px;
          height: 16px;
          cursor: pointer;
          accent-color: #2196F3;
        }
        .pipup-device-item .device-name {
          flex: 1;
          color: var(--primary-text-color, #e1e1e1);
          font-size: 13px;
        }
        .pipup-device-item .device-id {
          font-size: 11px;
          color: var(--secondary-text-color, #808080);
          display: ${showEntityIds ? 'inline' : 'none'};
        }
        .pipup-device-item .device-status {
          font-size: 11px;
          padding: 2px 8px;
          border-radius: 10px;
          font-weight: 500;
        }
        .pipup-device-item .device-status.online {
          color: #4CAF50;
          background: rgba(76, 175, 80, 0.15);
        }
        .pipup-device-item .device-status.offline {
          color: #f44336;
          background: rgba(244, 67, 54, 0.15);
        }
        .pipup-device-item .device-status.unknown {
          color: var(--secondary-text-color, #808080);
          background: rgba(128, 128, 128, 0.1);
        }
        .pipup-button-section {
          padding: 4px 8px;
        }
        .pipup-button-section-label {
          font-size: 13px;
          font-weight: 500;
          color: var(--secondary-text-color, #808080);
          margin-bottom: 4px;
        }
        .pipup-button-row-inline {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 2px 0;
        }
        .pipup-button-row-inline label {
          display: flex;
          align-items: center;
          gap: 4px;
          color: var(--primary-text-color, #e1e1e1);
          font-size: 13px;
          cursor: pointer;
          white-space: nowrap;
        }
        .pipup-button-row-inline input[type="checkbox"] {
          width: 16px;
          height: 16px;
          cursor: pointer;
          accent-color: #2196F3;
        }
        .pipup-button-row-inline input[type="text"] {
          flex: 1;
          padding: 4px 8px;
          background: var(--secondary-background-color, #2a2a2a);
          border: 1px solid var(--divider-color, #333);
          border-radius: 4px;
          color: var(--primary-text-color, #e1e1e1);
          font-size: 12px;
        }
        .pipup-button-row-inline input[type="text"]:focus {
          border-color: #2196F3;
          outline: none;
        }
        .pipup-button-row-inline input[type="text"]::placeholder {
          color: var(--secondary-text-color, #808080);
          font-size: 11px;
        }
        .pipup-button-row-inline .btn-id {
          min-width: 60px;
        }
        .pipup-token-status {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          background: rgba(33, 150, 243, 0.05);
          border-radius: 6px;
          border: 1px solid rgba(33, 150, 243, 0.2);
          margin: 4px 8px;
        }
        .pipup-token-status-label {
          font-size: 13px;
          color: var(--secondary-text-color, #808080);
        }
        .pipup-token-status-value {
          font-size: 13px;
          color: var(--primary-text-color, #e1e1e1);
          font-weight: 500;
        }
        .pipup-token-status-value.has-token {
          color: #4CAF50;
        }
        .pipup-token-status-value.no-token {
          color: var(--secondary-text-color, #808080);
        }
        .pipup-token-status-value.unknown {
          color: var(--secondary-text-color, #808080);
        }
      </style>
    `;

    let html = styles;

    // Device selector with checkboxes. Auth token status and the full TV
    // discovery summary live in the Visual Editor, not here.
    html += `
      <div class="pipup-device-selector">
        <span class="pipup-device-selector-label">📺 Target TVs</span>
        ${pipupEntities.length > 0 ? pipupEntities.map(entity => {
          const friendlyName = stripName(this._getFriendlyName(entity.entity_id), this._config.strip_strings);
          const isSelected = this._selectedDevices.includes(entity.entity_id);
          const status = this._getDeviceStatus(entity.entity_id);
          const statusClass = status === 'online' ? 'online' : (status === 'offline' ? 'offline' : 'unknown');
          const statusLabel = status === 'online' ? '🟢 Online' : (status === 'offline' ? '🔴 Offline' : '⚪ Unknown');
          
          return `
            <div class="pipup-device-item">
              <input type="checkbox" class="device-checkbox" value="${entity.entity_id}" ${isSelected ? 'checked' : ''}>
              <span class="device-name">${friendlyName}</span>
              <span class="device-id">${entity.entity_id}</span>
              <span class="device-status ${statusClass}">${statusLabel}</span>
            </div>
          `;
        }).join('') : `
          <div style="padding:8px;color:var(--secondary-text-color, #808080);font-style:italic;">
            No PiPup devices found. Make sure the integration is configured.
          </div>
        `}
      </div>
    `;

    // Check if PiPup integration is available
    const hasPipupService = !!(this._hass?.services?.pipup?.send);
    if (!hasPipupService) {
      html += `
        <div class="pipup-config-notice" style="background:rgba(244,67,54,0.1);border-color:#f44336;color:#f44336;">
          ⚠️ PiPup integration not found! Install via HACS.
        </div>
      `;
    }

    html += `
      <div class="pipup-error" id="pipup-error"></div>
      
      <div class="pipup-row">
        <span class="pipup-row-label">Message</span>
        <div class="pipup-row-value">
          <input type="text" id="pipup-message" value="${this._escapeHtml(message)}" placeholder="Enter message...">
        </div>
      </div>

      <div class="pipup-row">
        <span class="pipup-row-label">Image URL</span>
        <div class="pipup-row-value">
          <input type="text" id="pipup-image-uri" value="${this._escapeHtml(this._imageUri || '')}" placeholder="https://... (optional snapshot/image)">
        </div>
      </div>

      <div class="pipup-row">
        <span class="pipup-row-label">Video URL</span>
        <div class="pipup-row-value">
          <input type="text" id="pipup-video-uri" value="${this._escapeHtml(this._videoUri || '')}" placeholder="rtsp:// or .m3u8 (live camera stream)">
        </div>
      </div>
      <div style="font-size:11px;color:var(--secondary-text-color, #808080);padding:0 8px 4px;">
        💡 If both are set, the video stream takes priority.
      </div>

      <div class="pipup-row">
        <span class="pipup-row-label">Duration</span>
        <div class="pipup-row-value">
          <div class="pipup-row-with-unit">
            <input type="number" id="pipup-duration" value="${duration}" min="0" max="60">
            <span class="duration-unit">seconds (0=until dismissed)</span>
          </div>
        </div>
      </div>

      <div class="pipup-row">
        <span class="pipup-row-label">Position</span>
        <div class="pipup-row-value">
          <select id="pipup-position">
            ${POSITIONS_LIST.map(opt => `
              <option value="${opt.value}" ${position === opt.value ? 'selected' : ''}>
                ${opt.label}
              </option>
            `).join('')}
          </select>
        </div>
      </div>

      <div class="pipup-row">
        <span class="pipup-row-label">Color</span>
        <div class="pipup-row-value">
          <select id="pipup-color">
            ${COLORS.map(opt => `
              <option value="${opt.value}" ${backgroundColor === opt.value ? 'selected' : ''}>
                ${opt.label}
              </option>
            `).join('')}
          </select>
        </div>
      </div>

      <div class="pipup-row">
        <span class="pipup-row-label">Transparency</span>
        <div class="pipup-row-value">
          <select id="pipup-transparency">
            ${TRANSPARENCY_OPTIONS.map(opt => `
              <option value="${opt.value}" ${transparency === opt.value ? 'selected' : ''}>
                ${opt.label}
              </option>
            `).join('')}
          </select>
        </div>
      </div>

      <div class="pipup-toggle-row">
        <label>
          <input type="checkbox" id="pipup-show-progress" ${showProgress ? 'checked' : ''}>
          📊 Show progress bar
        </label>
      </div>

      <div class="pipup-toggle-row">
        <label>
          <input type="checkbox" id="pipup-tts" ${tts ? 'checked' : ''}>
          🔊 Speak aloud (TTS)
        </label>
      </div>

      <div class="pipup-toggle-row">
        <label>
          <input type="checkbox" id="pipup-interrupt" ${interrupt ? 'checked' : ''}>
          👆 Dismissible
        </label>
      </div>

      <hr class="pipup-divider">

      <!-- Button Configuration with Enable Checkboxes -->
      <div class="pipup-button-section">
        <div class="pipup-button-section-label">🔘 Remote-Operable Buttons</div>
        
        <!-- Button 1 -->
        <div class="pipup-button-row-inline">
          <label>
            <input type="checkbox" class="button-enable" data-button="1" ${this._button1Enabled ? 'checked' : ''}>
            Enable
          </label>
          <input type="text" class="button-label" data-button="1" value="${this._button1Label || ''}" placeholder="Label">
          <input type="text" class="button-id" data-button="1" value="${this._button1Id || ''}" placeholder="ID (e.g. unlock)">
        </div>
        
        <!-- Button 2 -->
        <div class="pipup-button-row-inline">
          <label>
            <input type="checkbox" class="button-enable" data-button="2" ${this._button2Enabled ? 'checked' : ''}>
            Enable
          </label>
          <input type="text" class="button-label" data-button="2" value="${this._button2Label || ''}" placeholder="Label">
          <input type="text" class="button-id" data-button="2" value="${this._button2Id || ''}" placeholder="ID (e.g. ignore)">
        </div>
        
        <!-- Button 3 -->
        <div class="pipup-button-row-inline">
          <label>
            <input type="checkbox" class="button-enable" data-button="3" ${this._button3Enabled ? 'checked' : ''}>
            Enable
          </label>
          <input type="text" class="button-label" data-button="3" value="${this._button3Label || ''}" placeholder="Label">
          <input type="text" class="button-id" data-button="3" value="${this._button3Id || ''}" placeholder="ID (e.g. snooze)">
        </div>
        
        <!-- Button Color -->
        <div class="pipup-row" style="padding-top:4px;">
          <span class="pipup-row-label" style="min-width:80px;font-size:13px;">Button Color</span>
          <div class="pipup-row-value">
            <input type="color" id="pipup-button-color" value="${this._config.button_color || '#1565C0'}">
          </div>
        </div>
      </div>

      <div style="font-size:11px;color:var(--secondary-text-color);padding:0 8px 4px;">
        💡 Buttons fire a <code>pipup_button</code> event. Use automation to react: <code>event_type: pipup_button</code>
      </div>

      <hr class="pipup-divider">

      <button class="pipup-send-btn" id="pipup-send">
        <ha-icon icon="mdi:send"></ha-icon>
        Send Notification
      </button>
    `;

    container.innerHTML = html;
    this.innerHTML = '';
    this.appendChild(container);
    this._rendered = true;

    this.attachEventListeners();
  }

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  attachEventListeners() {
    const messageInput = this.querySelector('#pipup-message');
    const imageUriInput = this.querySelector('#pipup-image-uri');
    const videoUriInput = this.querySelector('#pipup-video-uri');
    const durationInput = this.querySelector('#pipup-duration');
    const positionSelect = this.querySelector('#pipup-position');
    const colorSelect = this.querySelector('#pipup-color');
    const transparencySelect = this.querySelector('#pipup-transparency');
    const showProgressToggle = this.querySelector('#pipup-show-progress');
    const ttsToggle = this.querySelector('#pipup-tts');
    const interruptToggle = this.querySelector('#pipup-interrupt');
    const buttonColor = this.querySelector('#pipup-button-color');
    const sendBtn = this.querySelector('#pipup-send');

    // Device checkboxes
    this.querySelectorAll('.device-checkbox').forEach(cb => {
      cb.removeEventListener('change', this._deviceCheckboxHandler);
      this._deviceCheckboxHandler = () => {
        this._selectedDevices = [...this.querySelectorAll('.device-checkbox:checked')]
          .map(el => el.value);
        // Update config
        this._config.selected_devices = this._selectedDevices;
      };
      cb.addEventListener('change', this._deviceCheckboxHandler);
    });

    // Button enable checkboxes
    this.querySelectorAll('.button-enable').forEach(cb => {
      cb.removeEventListener('change', this._buttonEnableHandler);
      this._buttonEnableHandler = () => {
        const btnNum = cb.dataset.button;
        if (btnNum === '1') this._button1Enabled = cb.checked;
        else if (btnNum === '2') this._button2Enabled = cb.checked;
        else if (btnNum === '3') this._button3Enabled = cb.checked;
        // Update config
        this._config['button' + btnNum + '_enabled'] = cb.checked;
      };
      cb.addEventListener('change', this._buttonEnableHandler);
    });

    // Button label inputs
    this.querySelectorAll('.button-label').forEach(input => {
      input.removeEventListener('change', this._buttonLabelHandler);
      this._buttonLabelHandler = () => {
        const btnNum = input.dataset.button;
        if (btnNum === '1') this._button1Label = input.value;
        else if (btnNum === '2') this._button2Label = input.value;
        else if (btnNum === '3') this._button3Label = input.value;
        this._config['button' + btnNum + '_label'] = input.value;
      };
      input.addEventListener('change', this._buttonLabelHandler);
    });

    // Button ID inputs
    this.querySelectorAll('.button-id').forEach(input => {
      input.removeEventListener('change', this._buttonIdHandler);
      this._buttonIdHandler = () => {
        const btnNum = input.dataset.button;
        if (btnNum === '1') this._button1Id = input.value;
        else if (btnNum === '2') this._button2Id = input.value;
        else if (btnNum === '3') this._button3Id = input.value;
        this._config['button' + btnNum + '_id'] = input.value;
      };
      input.addEventListener('change', this._buttonIdHandler);
    });

    if (messageInput) {
      messageInput.removeEventListener('change', this._messageHandler);
      this._messageHandler = () => { this._message = messageInput.value; };
      messageInput.addEventListener('change', this._messageHandler);
    }

    if (imageUriInput) {
      imageUriInput.removeEventListener('change', this._imageUriHandler);
      this._imageUriHandler = () => { this._imageUri = imageUriInput.value; };
      imageUriInput.addEventListener('change', this._imageUriHandler);
    }

    if (videoUriInput) {
      videoUriInput.removeEventListener('change', this._videoUriHandler);
      this._videoUriHandler = () => { this._videoUri = videoUriInput.value; };
      videoUriInput.addEventListener('change', this._videoUriHandler);
    }

    if (durationInput) {
      durationInput.removeEventListener('change', this._durationHandler);
      this._durationHandler = () => { this._duration = parseInt(durationInput.value) || 0; };
      durationInput.addEventListener('change', this._durationHandler);
    }

    if (positionSelect) {
      positionSelect.removeEventListener('change', this._positionHandler);
      this._positionHandler = () => { this._position = parseInt(positionSelect.value); };
      positionSelect.addEventListener('change', this._positionHandler);
    }

    if (colorSelect) {
      colorSelect.removeEventListener('change', this._colorHandler);
      this._colorHandler = () => { this._backgroundColor = colorSelect.value; };
      colorSelect.addEventListener('change', this._colorHandler);
    }

    if (transparencySelect) {
      transparencySelect.removeEventListener('change', this._transparencyHandler);
      this._transparencyHandler = () => { this._transparency = transparencySelect.value; };
      transparencySelect.addEventListener('change', this._transparencyHandler);
    }

    if (showProgressToggle) {
      showProgressToggle.removeEventListener('change', this._showProgressHandler);
      this._showProgressHandler = () => { this._showProgress = showProgressToggle.checked; };
      showProgressToggle.addEventListener('change', this._showProgressHandler);
    }

    if (ttsToggle) {
      ttsToggle.removeEventListener('change', this._ttsHandler);
      this._ttsHandler = () => { this._tts = ttsToggle.checked; };
      ttsToggle.addEventListener('change', this._ttsHandler);
    }

    if (interruptToggle) {
      interruptToggle.removeEventListener('change', this._interruptHandler);
      this._interruptHandler = () => { this._interrupt = interruptToggle.checked; };
      interruptToggle.addEventListener('change', this._interruptHandler);
    }

    if (buttonColor) {
      buttonColor.removeEventListener('change', this._buttonColorHandler);
      this._buttonColorHandler = () => { 
        this._config.button_color = buttonColor.value;
      };
      buttonColor.addEventListener('change', this._buttonColorHandler);
    }

    if (sendBtn) {
      sendBtn.removeEventListener('click', this._sendHandler);
      this._sendHandler = () => {
        if (messageInput) this._message = messageInput.value;
        if (imageUriInput) this._imageUri = imageUriInput.value;
        if (videoUriInput) this._videoUri = videoUriInput.value;
        if (durationInput) this._duration = parseInt(durationInput.value) || 0;
        if (positionSelect) this._position = parseInt(positionSelect.value);
        if (colorSelect) this._backgroundColor = colorSelect.value;
        if (transparencySelect) this._transparency = transparencySelect.value;
        if (showProgressToggle) this._showProgress = showProgressToggle.checked;
        if (ttsToggle) this._tts = ttsToggle.checked;
        if (interruptToggle) this._interrupt = interruptToggle.checked;
        if (buttonColor) this._config.button_color = buttonColor.value;
        // Gather button values from inputs
        this.querySelectorAll('.button-enable').forEach(cb => {
          const btnNum = cb.dataset.button;
          if (btnNum === '1') this._button1Enabled = cb.checked;
          else if (btnNum === '2') this._button2Enabled = cb.checked;
          else if (btnNum === '3') this._button3Enabled = cb.checked;
        });
        this.querySelectorAll('.button-label').forEach(input => {
          const btnNum = input.dataset.button;
          if (btnNum === '1') this._button1Label = input.value;
          else if (btnNum === '2') this._button2Label = input.value;
          else if (btnNum === '3') this._button3Label = input.value;
        });
        this.querySelectorAll('.button-id').forEach(input => {
          const btnNum = input.dataset.button;
          if (btnNum === '1') this._button1Id = input.value;
          else if (btnNum === '2') this._button2Id = input.value;
          else if (btnNum === '3') this._button3Id = input.value;
        });
        // Gather selected devices
        this._selectedDevices = [...this.querySelectorAll('.device-checkbox:checked')]
          .map(el => el.value);
        this._config.selected_devices = this._selectedDevices;
        this.sendNotification();
      };
      sendBtn.addEventListener('click', this._sendHandler);
    }
  }

  updateStates() {
    // Live-update device connectivity statuses on the card as hass state changes
    const pipupEntities = this._getPipupEntities();

    const deviceItems = this.querySelectorAll('.pipup-device-item');
    deviceItems.forEach((item, index) => {
      if (index < pipupEntities.length) {
        const entity = pipupEntities[index];
        const status = this._getDeviceStatus(entity.entity_id);
        const statusEl = item.querySelector('.device-status');
        if (statusEl) {
          const statusClass = status === 'online' ? 'online' : (status === 'offline' ? 'offline' : 'unknown');
          const statusLabel = status === 'online' ? '🟢 Online' : (status === 'offline' ? '🔴 Offline' : '⚪ Unknown');
          statusEl.className = `device-status ${statusClass}`;
          statusEl.textContent = statusLabel;
        }
      }
    });
  }

  // ============ EDITOR ============
  static getConfigElement() {
    return document.createElement('pipup-notify-card-editor');
  }

  renderEditor() {
    if (!this._hass) {
      this.innerHTML = '<div style="padding:16px;color:#808080;">Loading...</div>';
      return;
    }

    if (this._editorRendered && this._editorContainer) {
      this.updateConfigPreview();
      return;
    }
    
    const container = document.createElement('div');
    container.style.padding = '16px';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '16px';
    container.style.maxHeight = '600px';
    container.style.overflowY = 'auto';
    container.id = 'editor-container';
    this._editorContainer = container;

    const config = this._config || PipupNotifyCard.getStubConfig();
    const pipupEntities = this._getPipupEntities();
    const selectedDevices = config.selected_devices || [];
    const hasToken = !!(config.token && config.token.trim());

    // Check if PiPup integration is available
    const hasPipupService = !!(this._hass?.services?.pipup?.send);

    let html = `
      <style>
        .editor-container { 
          padding: 16px; 
          display: flex; 
          flex-direction: column; 
          gap: 16px; 
          max-height: 600px; 
          overflow-y: auto; 
        }
        .editor-section { 
          border: 1px solid #333; 
          border-radius: 4px; 
          padding: 12px; 
          background: var(--ha-card-background, #1a1a1a);
        }
        .editor-section h3 { 
          margin: 0 0 4px 0; 
          font-size: 16px; 
          font-weight: 500; 
          color: var(--primary-text-color, #e1e1e1);
        }
        .editor-section .section-desc {
          font-size: 12px;
          color: var(--secondary-text-color, #808080);
          margin-bottom: 12px;
        }
        .editor-row { 
          display: flex; 
          align-items: center; 
          gap: 12px; 
          padding: 4px 0;
        }
        .editor-row label {
          min-width: 120px;
          color: var(--primary-text-color, #e1e1e1);
          font-size: 13px;
        }
        .editor-row input,
        .editor-row select {
          flex: 1;
          padding: 6px 10px;
          background: var(--secondary-background-color, #2a2a2a);
          border: 1px solid #333;
          border-radius: 4px;
          color: var(--primary-text-color, #e1e1e1);
          font-size: 13px;
        }
        .editor-row input:focus,
        .editor-row select:focus {
          border-color: #2196F3;
          outline: none;
        }
        .editor-row select {
          cursor: pointer;
        }
        .editor-row .hint {
          font-size: 12px;
          color: var(--secondary-text-color, #808080);
        }
        .editor-checkbox {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 4px 0;
        }
        .editor-checkbox label {
          display: flex;
          align-items: center;
          gap: 6px;
          color: var(--primary-text-color, #e1e1e1);
          font-size: 13px;
          cursor: pointer;
        }
        .editor-checkbox input[type="checkbox"] {
          width: 16px;
          height: 16px;
          cursor: pointer;
          accent-color: #2196F3;
        }
        .editor-color-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 4px 0;
          flex-wrap: wrap;
        }
        .editor-color-row label {
          min-width: 120px;
          color: var(--primary-text-color, #e1e1e1);
          font-size: 13px;
        }
        .editor-color-row input[type="color"] {
          width: 40px;
          height: 32px;
          padding: 2px;
          border: 1px solid #333;
          border-radius: 4px;
          background: transparent;
          cursor: pointer;
        }
        .editor-color-row input[type="color"]::-webkit-color-swatch-wrapper {
          padding: 0;
        }
        .editor-color-row input[type="color"]::-webkit-color-swatch {
          border: none;
          border-radius: 3px;
        }
        .editor-config { 
          border-top: 1px solid #333; 
          padding-top: 12px; 
          margin-top: 4px; 
        }
        .editor-config h3 {
          margin: 0 0 8px 0;
          font-size: 16px;
          font-weight: 500;
          color: var(--primary-text-color, #e1e1e1);
        }
        .editor-config pre { 
          font-size: 13px; 
          color: var(--secondary-text-color, #808080); 
          font-family: monospace; 
          background: var(--secondary-background-color, #1a1a1a); 
          padding: 12px; 
          border-radius: 4px; 
          white-space: pre-wrap; 
          word-break: break-all; 
          margin: 0;
          border: 1px solid #333;
        }
        .editor-help {
          font-size: 12px;
          color: var(--secondary-text-color, #808080);
          padding: 8px 0;
          border-top: 1px solid #333;
          margin-top: 8px;
        }
        .editor-help code {
          background: var(--secondary-background-color, #2a2a2a);
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 12px;
        }
        .editor-button-row {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 4px 0;
        }
        .editor-button-row label {
          min-width: 120px;
          color: var(--primary-text-color, #e1e1e1);
          font-size: 13px;
        }
        .editor-button-row input {
          flex: 1;
          padding: 6px 10px;
          background: var(--secondary-background-color, #2a2a2a);
          border: 1px solid #333;
          border-radius: 4px;
          color: var(--primary-text-color, #e1e1e1);
          font-size: 13px;
        }
        .editor-button-row input:focus {
          border-color: #2196F3;
          outline: none;
        }
        .editor-button-group {
          display: flex;
          flex: 1;
          gap: 8px;
        }
        .editor-button-group input {
          flex: 1;
        }
        .editor-device-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 4px 0;
        }
        .editor-device-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 4px 8px;
          border-radius: 4px;
          transition: background 0.2s;
        }
        .editor-device-item:hover {
          background: rgba(255, 255, 255, 0.05);
        }
        .editor-device-item input[type="checkbox"] {
          width: 16px;
          height: 16px;
          cursor: pointer;
          accent-color: #2196F3;
        }
        .editor-device-item .device-name {
          flex: 1;
          color: var(--primary-text-color, #e1e1e1);
          font-size: 13px;
        }
        .editor-device-item .device-id {
          font-size: 11px;
          color: var(--secondary-text-color, #808080);
        }
        .editor-device-item .device-status {
          font-size: 11px;
          padding: 2px 8px;
          border-radius: 10px;
          font-weight: 500;
        }
        .editor-device-item .device-status.online {
          color: #4CAF50;
          background: rgba(76, 175, 80, 0.15);
        }
        .editor-device-item .device-status.offline {
          color: #f44336;
          background: rgba(244, 67, 54, 0.15);
        }
        .editor-device-item .device-status.unknown {
          color: var(--secondary-text-color, #808080);
          background: rgba(128, 128, 128, 0.1);
        }
        .editor-select-all {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 4px 8px;
          border-bottom: 1px solid #333;
          margin-bottom: 4px;
        }
        .editor-select-all input[type="checkbox"] {
          width: 16px;
          height: 16px;
          cursor: pointer;
          accent-color: #2196F3;
        }
        .editor-select-all label {
          color: var(--primary-text-color, #e1e1e1);
          font-size: 13px;
          cursor: pointer;
        }
        .editor-status-badge {
          font-size: 11px;
          padding: 2px 10px;
          border-radius: 10px;
          display: inline-block;
        }
        .editor-status-badge.installed {
          color: #4CAF50;
          background: rgba(76, 175, 80, 0.15);
        }
        .editor-status-badge.not-installed {
          color: #f44336;
          background: rgba(244, 67, 54, 0.15);
        }
        .editor-token-status {
          font-size: 12px;
          color: var(--secondary-text-color, #808080);
          padding: 2px 8px;
          border-radius: 4px;
          display: inline-block;
        }
        .editor-token-status.has-token {
          color: #4CAF50;
          background: rgba(76, 175, 80, 0.1);
        }
        .editor-token-status.no-token {
          color: var(--secondary-text-color, #808080);
          background: rgba(128, 128, 128, 0.1);
        }
        .editor-default-label {
          font-size: 11px;
          color: var(--secondary-text-color, #808080);
          background: rgba(255, 152, 0, 0.15);
          padding: 0 6px;
          border-radius: 3px;
          margin-left: 6px;
        }
        .editor-button-inline {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 2px 0;
        }
        .editor-button-inline label {
          min-width: 80px;
          color: var(--primary-text-color, #e1e1e1);
          font-size: 13px;
        }
        .editor-button-inline input[type="text"] {
          flex: 1;
          padding: 4px 8px;
          background: var(--secondary-background-color, #2a2a2a);
          border: 1px solid #333;
          border-radius: 4px;
          color: var(--primary-text-color, #e1e1e1);
          font-size: 12px;
        }
        .editor-button-inline input[type="text"]:focus {
          border-color: #2196F3;
          outline: none;
        }
        .editor-button-inline input[type="checkbox"] {
          width: 16px;
          height: 16px;
          cursor: pointer;
          accent-color: #2196F3;
          flex-shrink: 0;
        }
        .editor-button-inline .btn-id {
          min-width: 60px;
        }
        .editor-device-count {
          font-size: 13px;
          color: var(--primary-text-color);
          font-weight: 500;
        }
        .editor-device-count .count {
          color: #4CAF50;
        }
        .editor-device-count .none {
          color: #f44336;
        }
      </style>
      <div class="editor-container">
        <div style="font-size:11px;color:var(--secondary-text-color, #808080);text-align:right;padding:0 4px;">PiPup Notify Card — ${BUILD_NUMBER}</div>
        
        <!-- PiPup TVs Detection - Exactly like the screenshot -->
        <div class="editor-section">
          <h3>📺 PiPup TVs</h3>
          <div class="section-desc">Detected PiPup devices on your network</div>
          
          <div style="display:flex;align-items:center;gap:12px;padding:4px 0;">
            <span style="font-size:13px;color:var(--primary-text-color);">Devices Found:</span>
            <span class="editor-device-count">
              ${pipupEntities.length > 0 ? `<span class="count">✅ ${pipupEntities.length}</span>` : `<span class="none">❌ 0</span>`}
            </span>
            ${pipupEntities.length > 0 ? `<span style="font-size:11px;color:var(--secondary-text-color);">${pipupEntities.map(e => e.entity_id).join(', ')}</span>` : ''}
          </div>
          
          <div class="editor-device-list">
            ${pipupEntities.length > 0 ? pipupEntities.map(entity => {
              const friendlyName = stripName(this._getFriendlyName(entity.entity_id), config.strip_strings);
              const isSelected = selectedDevices.includes(entity.entity_id);
              const status = this._getDeviceStatus(entity.entity_id);
              const statusClass = status === 'online' ? 'online' : (status === 'offline' ? 'offline' : 'unknown');
              const statusLabel = status === 'online' ? '🟢 Online' : (status === 'offline' ? '🔴 Offline' : '⚪ Unknown');
              
              return `
                <div class="editor-device-item">
                  <input type="checkbox" class="device-checkbox" value="${entity.entity_id}" ${isSelected ? 'checked' : ''}>
                  <span class="device-name">${friendlyName}</span>
                  <span class="device-id">${entity.entity_id}</span>
                  <span class="device-status ${statusClass}">${statusLabel}</span>
                </div>
              `;
            }).join('') : `
              <div style="padding:8px;color:var(--secondary-text-color, #808080);font-style:italic;">
                No PiPup devices found. Make sure the integration is installed and configured.
              </div>
            `}
          </div>
        </div>

        <!-- Text Stripper -->
        <div class="editor-section">
          <h3>✂️ Text Stripper</h3>
          <div class="section-desc">Words or phrases removed from friendly names wherever they're displayed (comma-separated). Defaults to stripping "PiPup".</div>
          
          <div class="editor-row">
            <label>Strip From Names</label>
            <input type="text" id="editor-strip-strings" value="${config.strip_strings !== undefined ? config.strip_strings : 'PiPup'}" placeholder="PiPup">
            <span class="hint">e.g. PiPup, TV</span>
          </div>
        </div>


        <div style="font-size:12px;color:var(--secondary-text-color, #808080);border-top:1px solid #333;padding-top:8px;margin-top:4px;">
          ⚙️ All settings below are defaults that will be applied when the card loads.
        </div>

        <!-- Default Values -->
        <div class="editor-section">
          <h3>📝 Default Values <span class="editor-default-label">Defaults</span></h3>
          <div class="section-desc">These values are used when the card loads</div>
          
          <div class="editor-row">
            <label>Title</label>
            <input type="text" id="editor-title" value="${config.title || 'Home Assistant'}" placeholder="Home Assistant">
          </div>
          
          <div class="editor-row">
            <label>Message</label>
            <input type="text" id="editor-default-message" value="${config.default_message || 'Hello from PiPup!'}" placeholder="Hello from PiPup!">
          </div>
          
          <div class="editor-row">
            <label>Duration</label>
            <input type="number" id="editor-default-duration" value="${config.default_duration || 10}" min="0" max="60">
            <span class="hint">seconds (0=until dismissed)</span>
          </div>
          
          <div class="editor-row">
            <label>Position</label>
            <select id="editor-default-position">
              ${POSITIONS_LIST.map(opt => `
                <option value="${opt.value}" ${config.default_position === opt.value ? 'selected' : ''}>
                  ${opt.label}
                </option>
              `).join('')}
            </select>
          </div>
          
          <div class="editor-row">
            <label>Color</label>
            <select id="editor-default-color">
              ${COLORS.map(opt => `
                <option value="${opt.value}" ${config.default_background_color === opt.value ? 'selected' : ''}>
                  ${opt.label}
                </option>
              `).join('')}
            </select>
          </div>
          
          <div class="editor-row">
            <label>Transparency</label>
            <select id="editor-default-transparency">
              ${TRANSPARENCY_OPTIONS.map(opt => `
                <option value="${opt.value}" ${config.default_transparency === opt.value ? 'selected' : ''}>
                  ${opt.label}
                </option>
              `).join('')}
            </select>
          </div>
        </div>

        <!-- Default Buttons with Enable Checkboxes -->
        <div class="editor-section">
          <h3>🔘 Default Buttons <span class="editor-default-label">Defaults</span></h3>
          <div class="section-desc">Default buttons that appear on the notification</div>
          
          <!-- Button 1 -->
          <div class="editor-button-inline">
            <label>
              <input type="checkbox" id="editor-button1-enabled" ${config.button1_enabled ? 'checked' : ''}>
              Enable
            </label>
            <input type="text" id="editor-button1-label" value="${config.button1_label || ''}" placeholder="Label">
            <input type="text" id="editor-button1-id" value="${config.button1_id || ''}" placeholder="ID" class="btn-id">
          </div>
          
          <!-- Button 2 -->
          <div class="editor-button-inline">
            <label>
              <input type="checkbox" id="editor-button2-enabled" ${config.button2_enabled ? 'checked' : ''}>
              Enable
            </label>
            <input type="text" id="editor-button2-label" value="${config.button2_label || ''}" placeholder="Label">
            <input type="text" id="editor-button2-id" value="${config.button2_id || ''}" placeholder="ID" class="btn-id">
          </div>
          
          <!-- Button 3 -->
          <div class="editor-button-inline">
            <label>
              <input type="checkbox" id="editor-button3-enabled" ${config.button3_enabled ? 'checked' : ''}>
              Enable
            </label>
            <input type="text" id="editor-button3-label" value="${config.button3_label || ''}" placeholder="Label">
            <input type="text" id="editor-button3-id" value="${config.button3_id || ''}" placeholder="ID" class="btn-id">
          </div>
          
          <div class="editor-row" style="margin-top:4px;">
            <label>Button Color</label>
            <input type="color" id="editor-button-color" value="${config.button_color || '#1565C0'}">
          </div>
        </div>

        <!-- Default Appearance -->
        <div class="editor-section">
          <h3>🎨 Default Appearance <span class="editor-default-label">Defaults</span></h3>
          <div class="section-desc">Visual styling defaults</div>
          
          <div class="editor-color-row">
            <label>Border Color</label>
            <input type="color" id="editor-border-color" value="${config.border_color || '#2196F3'}">
          </div>
          
          <div class="editor-color-row">
            <label>Title Color</label>
            <input type="color" id="editor-title-color" value="${config.title_color || '#FFFFFF'}">
          </div>
          
          <div class="editor-row">
            <label>Corner Radius</label>
            <input type="number" id="editor-corner-radius" value="${config.corner_radius || 18}" min="0" max="50">
            <span class="hint">pixels</span>
          </div>
          
          <div class="editor-row">
            <label>Border Width</label>
            <input type="number" id="editor-border-width" value="${config.border_width || 2}" min="0" max="10">
            <span class="hint">pixels</span>
          </div>
          
          <div class="editor-checkbox">
            <label>
              <input type="checkbox" id="editor-show-progress" ${config.show_progress !== false ? 'checked' : ''}>
              Show progress bar (default)
            </label>
          </div>
        </div>

        <!-- Default Behavior -->
        <div class="editor-section">
          <h3>⚙️ Default Behavior <span class="editor-default-label">Defaults</span></h3>
          <div class="section-desc">Default toggle states when the card loads</div>
          
          <div class="editor-checkbox">
            <label>
              <input type="checkbox" id="editor-tts-enabled" ${config.tts_enabled ? 'checked' : ''}>
              TTS enabled by default
            </label>
          </div>
          
          <div class="editor-checkbox">
            <label>
              <input type="checkbox" id="editor-interrupt-enabled" ${config.interrupt_enabled !== false ? 'checked' : ''}>
              Dismissible by default
            </label>
          </div>
        </div>

        <!-- Security -->
        <div class="editor-section">
          <h3>Security</h3>
          <div class="section-desc">Control what appears on the live card</div>
          
        <div class="editor-section">
          <h3>🔑 Auth Token</h3>
          <div class="section-desc">Authentication token for PiPup (if configured on the TV)</div>
          
          <div class="editor-row">
            <label>Auth Token</label>
            <input type="password" id="editor-token" value="${config.token || ''}" placeholder="Optional - set in PiPup settings">
            <span class="hint">Bearer token</span>
          </div>
          <div style="display:flex;align-items:center;gap:12px;padding:4px 0 4px 132px;">
            <span class="editor-token-status ${hasToken ? 'has-token' : 'no-token'}">
              ${hasToken ? '🔒 Configured' : '🔓 Not configured'}
            </span>
          </div>
        </div>
		  
        </div>

        <!-- Advanced -->
        <div class="editor-section">
          <h3>🐛 Advanced</h3>
          <div class="editor-checkbox">
            <label>
              <input type="checkbox" id="editor-debug" ${config.debug ? 'checked' : ''}>
              Enable debug logging
            </label>
          </div>
        </div>

        <div class="editor-config">
          <h3>📄 Current Configuration</h3>
          <pre id="config-preview">${JSON.stringify(config, null, 2)}</pre>
        </div>

        <div class="editor-help">
          💡 <strong>How to use:</strong> Install the PiPup integration via HACS. Select which TVs to send notifications to.
          <br><br>
          🔘 <strong>Buttons:</strong> When a button is pressed on the TV, a <code>pipup_button</code> event is fired. 
          Create an automation with <code>event_type: pipup_button</code> and filter by <code>button</code>.
          <br><br>
          📝 <strong>Field names:</strong> Uses <code>background_color</code>, <code>title_color</code>, <code>corner_radius</code>, <code>border_color</code>, <code>border_width</code> (snake_case, not camelCase).
          <br><br>
          👁️ <strong>Entity IDs:</strong> Toggle "Show entity IDs" to display them on the live card.
          <br><br>
          📶 <strong>Status:</strong> Device status uses the <code>binary_sensor.pipup_*_connectivity</code> sensor for accurate Online/Offline detection.
        </div>
      </div>
    `;

    container.innerHTML = html;
    this.innerHTML = '';
    this.appendChild(container);
    this._editorRendered = true;
    this._rendered = true;

    this.attachEditorListeners();
  }

  attachEditorListeners() {
    // Device checkboxes
    this.querySelectorAll('.device-checkbox').forEach(cb => {
      cb.removeEventListener('change', this._deviceChangeHandler);
      this._deviceChangeHandler = () => {
        const selected = [...this.querySelectorAll('.device-checkbox:checked')]
          .map(el => el.value);
        this._config.selected_devices = selected;
        this.updateConfigPreview();
        this.dispatchEvent(new CustomEvent('config-changed', {
          detail: { config: this._config },
          bubbles: true,
          composed: true
        }));
      };
      cb.addEventListener('change', this._deviceChangeHandler);
    });

    // Regular fields
    const fields = [
      { id: 'editor-token', key: 'token', type: 'string' },
      { id: 'editor-strip-strings', key: 'strip_strings', type: 'string' },
      { id: 'editor-title', key: 'title', type: 'string' },
      { id: 'editor-default-message', key: 'default_message', type: 'string' },
      { id: 'editor-default-duration', key: 'default_duration', type: 'number' },
      { id: 'editor-default-position', key: 'default_position', type: 'number' },
      { id: 'editor-default-color', key: 'default_background_color', type: 'string' },
      { id: 'editor-default-transparency', key: 'default_transparency', type: 'string' },
      { id: 'editor-border-color', key: 'border_color', type: 'string' },
      { id: 'editor-title-color', key: 'title_color', type: 'string' },
      { id: 'editor-corner-radius', key: 'corner_radius', type: 'number' },
      { id: 'editor-border-width', key: 'border_width', type: 'number' },
      { id: 'editor-button1-label', key: 'button1_label', type: 'string' },
      { id: 'editor-button1-id', key: 'button1_id', type: 'string' },
      { id: 'editor-button2-label', key: 'button2_label', type: 'string' },
      { id: 'editor-button2-id', key: 'button2_id', type: 'string' },
      { id: 'editor-button3-label', key: 'button3_label', type: 'string' },
      { id: 'editor-button3-id', key: 'button3_id', type: 'string' },
      { id: 'editor-button-color', key: 'button_color', type: 'string' },
      { id: 'editor-show-entity-ids', key: 'show_entity_ids', type: 'boolean' },
    ];

    fields.forEach(({ id, key, type }) => {
      const el = this.querySelector(`#${id}`);
      if (!el) return;
      
      if (type === 'boolean') {
        el.removeEventListener('change', this[`_${key}Handler`]);
        this[`_${key}Handler`] = () => {
          this._config[key] = el.checked;
          this.updateConfigPreview();
          this.dispatchEvent(new CustomEvent('config-changed', {
            detail: { config: this._config },
            bubbles: true,
            composed: true
          }));
        };
        el.addEventListener('change', this[`_${key}Handler`]);
      } else {
        el.removeEventListener('change', this[`_${key}Handler`]);
        this[`_${key}Handler`] = () => {
          this._config[key] = type === 'number' ? parseInt(el.value) || 0 : el.value;
          this.updateConfigPreview();
          this.dispatchEvent(new CustomEvent('config-changed', {
            detail: { config: this._config },
            bubbles: true,
            composed: true
          }));
        };
        el.addEventListener('change', this[`_${key}Handler`]);
      }
    });

    // Button enabled checkboxes
    ['button1-enabled', 'button2-enabled', 'button3-enabled'].forEach(id => {
      const el = this.querySelector(`#${id}`);
      if (!el) return;
      const key = id.replace('-', '_');
      el.removeEventListener('change', this[`_${key}Handler`]);
      this[`_${key}Handler`] = () => {
        this._config[key] = el.checked;
        this.updateConfigPreview();
        this.dispatchEvent(new CustomEvent('config-changed', {
          detail: { config: this._config },
          bubbles: true,
          composed: true
        }));
      };
      el.addEventListener('change', this[`_${key}Handler`]);
    });

    // Checkboxes
    const checkboxes = [
      { id: 'editor-show-progress', key: 'show_progress' },
      { id: 'editor-tts-enabled', key: 'tts_enabled' },
      { id: 'editor-interrupt-enabled', key: 'interrupt_enabled' },
      { id: 'editor-debug', key: 'debug' },
    ];

    checkboxes.forEach(({ id, key }) => {
      const el = this.querySelector(`#${id}`);
      if (!el) return;
      
      el.removeEventListener('change', this[`_${key}Handler`]);
      this[`_${key}Handler`] = () => {
        this._config[key] = el.checked;
        if (key === 'debug') DEBUG = el.checked;
        this.updateConfigPreview();
        this.dispatchEvent(new CustomEvent('config-changed', {
          detail: { config: this._config },
          bubbles: true,
          composed: true
        }));
      };
      el.addEventListener('change', this[`_${key}Handler`]);
    });
  }

  updateConfigPreview() {
    const preview = this.querySelector('#config-preview');
    if (preview) {
      const configCopy = { ...this._config };
      if (configCopy.token) {
        const tokenLen = configCopy.token.length;
        configCopy.token = tokenLen > 6 
          ? configCopy.token.substring(0, 4) + '••••' + configCopy.token.substring(tokenLen - 2) 
          : '••••';
      }
      preview.textContent = JSON.stringify(configCopy, null, 2);
    }
  }
}

// ============ EDITOR CLASS ============
class PipupNotifyCardEditor extends HTMLElement {
  constructor() {
    super();
    this._config = {};
    this._hass = null;
  }

  setConfig(config) {
    this._config = { ...config };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    // Refresh just the TV list/status in place so typing in other fields isn't disrupted
    this._updateTvList();
  }

  get hass() {
    return this._hass;
  }

  _fire(config) {
    this.dispatchEvent(new CustomEvent('config-changed', {
      detail: { config },
      bubbles: true,
      composed: true,
    }));
  }

  _renderTvListInner() {
    const tvs = discoverPipupTvs(this._hass);
    if (!this._hass) {
      return `<div style="padding:8px;color:var(--secondary-text-color, #808080);font-style:italic;font-size:13px;">Loading…</div>`;
    }
    if (tvs.length === 0) {
      return `<div style="padding:8px;color:var(--secondary-text-color, #808080);font-style:italic;font-size:13px;">No PiPup devices found. Make sure the integration is installed and configured.</div>`;
    }
    const stripStrings = this._config.strip_strings !== undefined ? this._config.strip_strings : 'PiPup';
    return tvs.map(tv => {
      const displayName = stripName(tv.friendlyName, stripStrings);
      const statusColor = tv.status === 'online' ? '#4CAF50' : (tv.status === 'offline' ? '#f44336' : 'var(--secondary-text-color, #808080)');
      const statusLabel = tv.status === 'online' ? '🟢 Online' : (tv.status === 'offline' ? '🔴 Offline' : '⚪ Unknown');
      return `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 4px;border-top:1px solid #333;">
          <div style="display:flex;flex-direction:column;">
            <span style="color:var(--primary-text-color);font-size:13px;">${displayName}</span>
            <span style="color:var(--secondary-text-color, #808080);font-size:11px;">${tv.entityId}</span>
          </div>
          <span style="color:${statusColor};font-size:12px;font-weight:500;white-space:nowrap;">${statusLabel}</span>
        </div>
      `;
    }).join('');
  }

  _updateTvList() {
    const el = this.querySelector('#editor-tv-list');
    if (el) el.innerHTML = this._renderTvListInner();
  }

  _render() {
    const cfg = this._config;
    this.innerHTML = `
      <div style="padding:16px;display:flex;flex-direction:column;gap:12px;">
        <div style="font-size:16px;font-weight:500;color:var(--primary-text-color);">
          PiPup Notify Card Editor — ${BUILD_NUMBER}
        </div>

        <div style="border:1px solid #333;border-radius:4px;padding:12px;background:var(--ha-card-background, #1a1a1a);">
          <div style="font-weight:500;margin-bottom:4px;color:var(--primary-text-color);">📺 PiPup TVs</div>
          <div style="font-size:12px;color:var(--secondary-text-color, #808080);margin-bottom:8px;">Detected live from Home Assistant's entity/device registry</div>
          <div id="editor-tv-list">${this._renderTvListInner()}</div>
        </div>

        <div style="border:1px solid #333;border-radius:4px;padding:12px;background:var(--ha-card-background, #1a1a1a);">
          <div style="font-weight:500;margin-bottom:8px;color:var(--primary-text-color);">✂️ Text Stripper</div>
          <div style="font-size:12px;color:var(--secondary-text-color, #808080);margin-bottom:8px;">Words/phrases removed from friendly names on the card (comma-separated)</div>
          <div style="display:flex;align-items:center;gap:12px;padding:4px 0;">
            <label style="min-width:100px;color:var(--primary-text-color);font-size:13px;">Strip Words</label>
            <input type="text" id="editor-strip-strings" value="${cfg.strip_strings !== undefined ? cfg.strip_strings : 'PiPup'}" placeholder="PiPup"
                   style="flex:1;padding:6px 10px;background:var(--secondary-background-color, #2a2a2a);border:1px solid #333;border-radius:4px;color:var(--primary-text-color);font-size:13px;">
          </div>
        </div>
        
        <div style="border:1px solid #333;border-radius:4px;padding:12px;background:var(--ha-card-background, #1a1a1a);">
          <div style="font-weight:500;margin-bottom:8px;color:var(--primary-text-color);">Default Values</div>
          <div style="display:flex;align-items:center;gap:12px;padding:4px 0;">
            <label style="min-width:100px;color:var(--primary-text-color);font-size:13px;">Token</label>
            <input type="password" id="editor-token" value="${cfg.token || ''}" placeholder="Optional"
                   style="flex:1;padding:6px 10px;background:var(--secondary-background-color, #2a2a2a);border:1px solid #333;border-radius:4px;color:var(--primary-text-color);font-size:13px;">
          </div>
          <div style="padding:2px 0 4px 112px;">
            <span style="font-size:12px;font-weight:500;color:${cfg.token && cfg.token.trim() ? '#4CAF50' : 'var(--secondary-text-color, #808080)'};">
              ${cfg.token && cfg.token.trim() ? '🔒 Configured' : '🔓 Not configured'}
            </span>
          </div>
          <div style="display:flex;align-items:center;gap:12px;padding:4px 0;">
            <label style="min-width:100px;color:var(--primary-text-color);font-size:13px;">Title</label>
            <input type="text" id="editor-title" value="${cfg.title || 'Home Assistant'}" 
                   style="flex:1;padding:6px 10px;background:var(--secondary-background-color, #2a2a2a);border:1px solid #333;border-radius:4px;color:var(--primary-text-color);font-size:13px;">
          </div>
          <div style="display:flex;align-items:center;gap:12px;padding:4px 0;">
            <label style="min-width:100px;color:var(--primary-text-color);font-size:13px;">Message</label>
            <input type="text" id="editor-default-message" value="${cfg.default_message || ''}" 
                   style="flex:1;padding:6px 10px;background:var(--secondary-background-color, #2a2a2a);border:1px solid #333;border-radius:4px;color:var(--primary-text-color);font-size:13px;">
          </div>
          <div style="display:flex;align-items:center;gap:12px;padding:4px 0;">
            <label style="min-width:100px;color:var(--primary-text-color);font-size:13px;">Duration</label>
            <input type="number" id="editor-default-duration" value="${cfg.default_duration || 10}" min="0" max="60"
                   style="flex:1;padding:6px 10px;background:var(--secondary-background-color, #2a2a2a);border:1px solid #333;border-radius:4px;color:var(--primary-text-color);font-size:13px;">
          </div>
        </div>

        <div style="border:1px solid #333;border-radius:4px;padding:12px;background:var(--ha-card-background, #1a1a1a);">
          <div style="font-weight:500;margin-bottom:8px;color:var(--primary-text-color);">Default Appearance</div>
          <div style="display:flex;align-items:center;gap:12px;padding:4px 0;">
            <label style="min-width:100px;color:var(--primary-text-color);font-size:13px;">Background Color</label>
            <select id="editor-default-color" style="flex:1;padding:6px 10px;background:var(--secondary-background-color, #2a2a2a);border:1px solid #333;border-radius:4px;color:var(--primary-text-color);font-size:13px;cursor:pointer;">
              ${COLORS.map(opt => `
                <option value="${opt.value}" ${cfg.default_background_color === opt.value ? 'selected' : ''}>${opt.label}</option>
              `).join('')}
            </select>
          </div>
          <div style="display:flex;align-items:center;gap:12px;padding:4px 0;">
            <label style="min-width:100px;color:var(--primary-text-color);font-size:13px;">Transparency</label>
            <select id="editor-default-transparency" style="flex:1;padding:6px 10px;background:var(--secondary-background-color, #2a2a2a);border:1px solid #333;border-radius:4px;color:var(--primary-text-color);font-size:13px;cursor:pointer;">
              ${TRANSPARENCY_OPTIONS.map(opt => `
                <option value="${opt.value}" ${cfg.default_transparency === opt.value ? 'selected' : ''}>${opt.label}</option>
              `).join('')}
            </select>
          </div>
          <div style="display:flex;align-items:center;gap:12px;padding:4px 0;">
            <label style="min-width:100px;color:var(--primary-text-color);font-size:13px;">Position</label>
            <select id="editor-default-position" style="flex:1;padding:6px 10px;background:var(--secondary-background-color, #2a2a2a);border:1px solid #333;border-radius:4px;color:var(--primary-text-color);font-size:13px;cursor:pointer;">
              ${POSITIONS_LIST.map(opt => `
                <option value="${opt.value}" ${cfg.default_position === opt.value ? 'selected' : ''}>${opt.label}</option>
              `).join('')}
            </select>
          </div>
        </div>

        <div style="border:1px solid #333;border-radius:4px;padding:12px;background:var(--ha-card-background, #1a1a1a);">
          <div style="font-weight:500;margin-bottom:8px;color:var(--primary-text-color);">Default Toggles</div>
          <div style="display:flex;align-items:center;gap:12px;padding:4px 0;">
            <label style="display:flex;align-items:center;gap:6px;color:var(--primary-text-color);font-size:13px;cursor:pointer;">
              <input type="checkbox" id="editor-show-progress" ${cfg.show_progress !== false ? 'checked' : ''}> Show progress bar
            </label>
          </div>
          <div style="display:flex;align-items:center;gap:12px;padding:4px 0;">
            <label style="display:flex;align-items:center;gap:6px;color:var(--primary-text-color);font-size:13px;cursor:pointer;">
              <input type="checkbox" id="editor-tts-enabled" ${cfg.tts_enabled ? 'checked' : ''}> TTS enabled by default
            </label>
          </div>

          <div style="display:flex;align-items:center;gap:12px;padding:4px 0;">
            <label style="display:flex;align-items:center;gap:6px;color:var(--primary-text-color);font-size:13px;cursor:pointer;">
              <input type="checkbox" id="editor-show-entity-ids" ${cfg.show_entity_ids ? 'checked' : ''}> Show entity IDs on the card
            </label>
          </div>

          <div style="display:flex;align-items:center;gap:12px;padding:4px 0;">
            <label style="display:flex;align-items:center;gap:6px;color:var(--primary-text-color);font-size:13px;cursor:pointer;">
              <input type="checkbox" id="editor-interrupt-enabled" ${cfg.interrupt_enabled !== false ? 'checked' : ''}> Dismissible by default
            </label>
          </div>
        </div>

        <div style="border:1px solid #333;border-radius:4px;padding:12px;background:var(--ha-card-background, #1a1a1a);">
          <div style="font-weight:500;margin-bottom:8px;color:var(--primary-text-color);">Default Buttons</div>
          <div style="display:flex;align-items:center;gap:8px;padding:4px 0;">
            <label style="display:flex;align-items:center;gap:4px;color:var(--primary-text-color);font-size:13px;cursor:pointer;min-width:60px;">
              <input type="checkbox" id="editor-button1-enabled" ${cfg.button1_enabled ? 'checked' : ''}> Btn 1
            </label>
            <input type="text" id="editor-button1-label" value="${cfg.button1_label || ''}" placeholder="Label" style="flex:1;padding:6px 10px;background:var(--secondary-background-color, #2a2a2a);border:1px solid #333;border-radius:4px;color:var(--primary-text-color);font-size:13px;">
            <input type="text" id="editor-button1-id" value="${cfg.button1_id || ''}" placeholder="ID" style="flex:1;padding:6px 10px;background:var(--secondary-background-color, #2a2a2a);border:1px solid #333;border-radius:4px;color:var(--primary-text-color);font-size:13px;">
          </div>
          <div style="display:flex;align-items:center;gap:8px;padding:4px 0;">
            <label style="display:flex;align-items:center;gap:4px;color:var(--primary-text-color);font-size:13px;cursor:pointer;min-width:60px;">
              <input type="checkbox" id="editor-button2-enabled" ${cfg.button2_enabled ? 'checked' : ''}> Btn 2
            </label>
            <input type="text" id="editor-button2-label" value="${cfg.button2_label || ''}" placeholder="Label" style="flex:1;padding:6px 10px;background:var(--secondary-background-color, #2a2a2a);border:1px solid #333;border-radius:4px;color:var(--primary-text-color);font-size:13px;">
            <input type="text" id="editor-button2-id" value="${cfg.button2_id || ''}" placeholder="ID" style="flex:1;padding:6px 10px;background:var(--secondary-background-color, #2a2a2a);border:1px solid #333;border-radius:4px;color:var(--primary-text-color);font-size:13px;">
          </div>
          <div style="display:flex;align-items:center;gap:8px;padding:4px 0;">
            <label style="display:flex;align-items:center;gap:4px;color:var(--primary-text-color);font-size:13px;cursor:pointer;min-width:60px;">
              <input type="checkbox" id="editor-button3-enabled" ${cfg.button3_enabled ? 'checked' : ''}> Btn 3
            </label>
            <input type="text" id="editor-button3-label" value="${cfg.button3_label || ''}" placeholder="Label" style="flex:1;padding:6px 10px;background:var(--secondary-background-color, #2a2a2a);border:1px solid #333;border-radius:4px;color:var(--primary-text-color);font-size:13px;">
            <input type="text" id="editor-button3-id" value="${cfg.button3_id || ''}" placeholder="ID" style="flex:1;padding:6px 10px;background:var(--secondary-background-color, #2a2a2a);border:1px solid #333;border-radius:4px;color:var(--primary-text-color);font-size:13px;">
          </div>
          <div style="display:flex;align-items:center;gap:12px;padding:4px 0;">
            <label style="min-width:60px;color:var(--primary-text-color);font-size:13px;">Button Color</label>
            <input type="color" id="editor-button-color" value="${cfg.button_color || '#1565C0'}" style="width:40px;height:32px;padding:2px;border:1px solid #333;border-radius:4px;background:transparent;cursor:pointer;">
          </div>
        </div>

        <div style="border:1px solid #333;border-radius:4px;padding:12px;background:var(--ha-card-background, #1a1a1a);">
          <div style="font-weight:500;margin-bottom:8px;color:var(--primary-text-color);">Default Colors</div>
          <div style="display:flex;align-items:center;gap:12px;padding:4px 0;">
            <label style="min-width:80px;color:var(--primary-text-color);font-size:13px;">Border Color</label>
            <input type="color" id="editor-border-color" value="${cfg.border_color || '#2196F3'}" style="width:40px;height:32px;padding:2px;border:1px solid #333;border-radius:4px;background:transparent;cursor:pointer;">
          </div>
          <div style="display:flex;align-items:center;gap:12px;padding:4px 0;">
            <label style="min-width:80px;color:var(--primary-text-color);font-size:13px;">Title Color</label>
            <input type="color" id="editor-title-color" value="${cfg.title_color || '#FFFFFF'}" style="width:40px;height:32px;padding:2px;border:1px solid #333;border-radius:4px;background:transparent;cursor:pointer;">
          </div>
          <div style="display:flex;align-items:center;gap:12px;padding:4px 0;">
            <label style="min-width:80px;color:var(--primary-text-color);font-size:13px;">Corner Radius</label>
            <input type="number" id="editor-corner-radius" value="${cfg.corner_radius || 18}" min="0" max="50" style="flex:1;padding:6px 10px;background:var(--secondary-background-color, #2a2a2a);border:1px solid #333;border-radius:4px;color:var(--primary-text-color);font-size:13px;">
          </div>
          <div style="display:flex;align-items:center;gap:12px;padding:4px 0;">
            <label style="min-width:80px;color:var(--primary-text-color);font-size:13px;">Border Width</label>
            <input type="number" id="editor-border-width" value="${cfg.border_width || 2}" min="0" max="10" style="flex:1;padding:6px 10px;background:var(--secondary-background-color, #2a2a2a);border:1px solid #333;border-radius:4px;color:var(--primary-text-color);font-size:13px;">
          </div>
        </div>

        <div style="border:1px solid #333;border-radius:4px;padding:12px;background:var(--ha-card-background, #1a1a1a);">
          <div style="font-weight:500;margin-bottom:4px;color:var(--primary-text-color);">🎬 Media &amp; Animation</div>
          <div style="font-size:12px;color:var(--secondary-text-color, #808080);margin-bottom:8px;">Applied whenever an Image URL or Video URL is sent from the card</div>
          <div style="display:flex;align-items:center;gap:12px;padding:4px 0;">
            <label style="min-width:100px;color:var(--primary-text-color);font-size:13px;">Media Width</label>
            <input type="number" id="editor-default-media-width" value="${cfg.default_media_width || 480}" min="0" max="4000" style="flex:1;padding:6px 10px;background:var(--secondary-background-color, #2a2a2a);border:1px solid #333;border-radius:4px;color:var(--primary-text-color);font-size:13px;">
            <span style="font-size:11px;color:var(--secondary-text-color, #808080);">px</span>
          </div>
          <div style="display:flex;align-items:center;gap:12px;padding:4px 0;">
            <label style="min-width:100px;color:var(--primary-text-color);font-size:13px;">Media Position</label>
            <select id="editor-default-media-position" style="flex:1;padding:6px 10px;background:var(--secondary-background-color, #2a2a2a);border:1px solid #333;border-radius:4px;color:var(--primary-text-color);font-size:13px;cursor:pointer;">
              ${MEDIA_POSITIONS.map(opt => `
                <option value="${opt.value}" ${cfg.default_media_position === opt.value ? 'selected' : ''}>${opt.label}</option>
              `).join('')}
            </select>
          </div>
          <div style="display:flex;align-items:center;gap:12px;padding:4px 0;">
            <label style="min-width:100px;color:var(--primary-text-color);font-size:13px;">Title Alignment</label>
            <select id="editor-default-title-alignment" style="flex:1;padding:6px 10px;background:var(--secondary-background-color, #2a2a2a);border:1px solid #333;border-radius:4px;color:var(--primary-text-color);font-size:13px;cursor:pointer;">
              ${TITLE_ALIGNMENTS.map(opt => `
                <option value="${opt.value}" ${cfg.default_title_alignment === opt.value ? 'selected' : ''}>${opt.label}</option>
              `).join('')}
            </select>
          </div>
          <div style="display:flex;align-items:center;gap:12px;padding:4px 0;">
            <label style="min-width:100px;color:var(--primary-text-color);font-size:13px;">Animation</label>
            <select id="editor-default-animation-type" style="flex:1;padding:6px 10px;background:var(--secondary-background-color, #2a2a2a);border:1px solid #333;border-radius:4px;color:var(--primary-text-color);font-size:13px;cursor:pointer;">
              ${ANIMATION_TYPES.map(opt => `
                <option value="${opt.value}" ${cfg.default_animation_type === opt.value ? 'selected' : ''}>${opt.label}</option>
              `).join('')}
            </select>
          </div>
          <div style="display:flex;align-items:center;gap:12px;padding:4px 0;">
            <label style="min-width:100px;color:var(--primary-text-color);font-size:13px;">Anim. Duration</label>
            <input type="number" id="editor-default-animation-duration" value="${cfg.default_animation_duration !== undefined ? cfg.default_animation_duration : 250}" min="0" max="5000" style="flex:1;padding:6px 10px;background:var(--secondary-background-color, #2a2a2a);border:1px solid #333;border-radius:4px;color:var(--primary-text-color);font-size:13px;">
            <span style="font-size:11px;color:var(--secondary-text-color, #808080);">ms</span>
          </div>
        </div>

        <div style="border:1px solid #333;border-radius:4px;padding:12px;background:var(--ha-card-background, #1a1a1a);">
          <div style="font-weight:500;margin-bottom:8px;color:var(--primary-text-color);">Card Display</div>

        </div>

        <div style="border:1px solid #333;border-radius:4px;padding:12px;background:var(--ha-card-background, #1a1a1a);">
          <div style="display:flex;align-items:center;gap:12px;padding:4px 0;">
            <label style="display:flex;align-items:center;gap:6px;color:var(--primary-text-color);font-size:13px;cursor:pointer;">
              <input type="checkbox" id="editor-debug" ${cfg.debug ? 'checked' : ''}> Enable debug logging
            </label>
          </div>
        </div>

        <div style="border-top:1px solid #333;padding-top:12px;margin-top:4px;">
          <div style="font-weight:500;margin-bottom:8px;color:var(--primary-text-color);">Current Configuration</div>
          <pre style="font-size:13px;color:var(--secondary-text-color, #808080);font-family:monospace;background:var(--secondary-background-color, #1a1a1a);padding:12px;border-radius:4px;white-space:pre-wrap;word-break:break-all;margin:0;border:1px solid #333;">${JSON.stringify(cfg, null, 2)}</pre>
        </div>
      </div>
    `;

    this.attachEditorListeners();
  }

  attachEditorListeners() {
    const fields = [
      { id: 'editor-token', key: 'token' },
      { id: 'editor-strip-strings', key: 'strip_strings' },
      { id: 'editor-title', key: 'title' },
      { id: 'editor-default-message', key: 'default_message' },
      { id: 'editor-default-duration', key: 'default_duration' },
      { id: 'editor-default-position', key: 'default_position' },
      { id: 'editor-default-color', key: 'default_background_color' },
      { id: 'editor-default-transparency', key: 'default_transparency' },
      { id: 'editor-border-color', key: 'border_color' },
      { id: 'editor-title-color', key: 'title_color' },
      { id: 'editor-corner-radius', key: 'corner_radius' },
      { id: 'editor-border-width', key: 'border_width' },
      { id: 'editor-button1-label', key: 'button1_label' },
      { id: 'editor-button1-id', key: 'button1_id' },
      { id: 'editor-button2-label', key: 'button2_label' },
      { id: 'editor-button2-id', key: 'button2_id' },
      { id: 'editor-button3-label', key: 'button3_label' },
      { id: 'editor-button3-id', key: 'button3_id' },
      { id: 'editor-button-color', key: 'button_color' },
      { id: 'editor-show-entity-ids', key: 'show_entity_ids' },
      { id: 'editor-default-media-width', key: 'default_media_width' },
      { id: 'editor-default-media-position', key: 'default_media_position', numeric: true },
      { id: 'editor-default-title-alignment', key: 'default_title_alignment', numeric: true },
      { id: 'editor-default-animation-type', key: 'default_animation_type' },
      { id: 'editor-default-animation-duration', key: 'default_animation_duration' },
    ];

    fields.forEach(({ id, key, numeric }) => {
      const el = this.querySelector(`#${id}`);
      if (!el) return;
      const isCheckbox = el.type === 'checkbox';
      el.removeEventListener('change', this[`_${key}Handler`]);
      this[`_${key}Handler`] = () => {
        const val = isCheckbox ? el.checked : ((el.type === 'number' || numeric) ? parseInt(el.value) || 0 : el.value);
        const newConfig = { ...this._config, [key]: val };
        this._fire(newConfig);
      };
      el.addEventListener('change', this[`_${key}Handler`]);
    });

    // Button enabled checkboxes
    ['button1-enabled', 'button2-enabled', 'button3-enabled'].forEach(id => {
      const el = this.querySelector(`#${id}`);
      if (!el) return;
      const key = id.replace('-', '_');
      el.removeEventListener('change', this[`_${key}Handler`]);
      this[`_${key}Handler`] = () => {
        const newConfig = { ...this._config, [key]: el.checked };
        this._fire(newConfig);
      };
      el.addEventListener('change', this[`_${key}Handler`]);
    });

    const checkboxes = [
      { id: 'editor-show-progress', key: 'show_progress' },
      { id: 'editor-tts-enabled', key: 'tts_enabled' },
      { id: 'editor-interrupt-enabled', key: 'interrupt_enabled' },
      { id: 'editor-debug', key: 'debug' },
    ];

    checkboxes.forEach(({ id, key }) => {
      const el = this.querySelector(`#${id}`);
      if (!el) return;
      el.removeEventListener('change', this[`_${key}Handler`]);
      this[`_${key}Handler`] = () => {
        const newConfig = { ...this._config, [key]: el.checked };
        this._fire(newConfig);
      };
      el.addEventListener('change', this[`_${key}Handler`]);
    });
  }
}

// ============ REGISTER CUSTOM ELEMENTS ============
console.log(`📦 Registering pipup-notify-card custom elements... [${BUILD_NUMBER}]`);

customElements.define('pipup-notify-card', PipupNotifyCard);
customElements.define('pipup-notify-card-editor', PipupNotifyCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'pipup-notify-card',
  name: 'PiPup Notify Card',
  description: 'Send notifications with buttons to Android TV via PiPup',
});

console.log(`✅ pipup-notify-card registered successfully! [${BUILD_NUMBER}]`);