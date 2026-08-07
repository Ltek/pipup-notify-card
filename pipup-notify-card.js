// pipup-notify-card.js
// PiPup Notification Card for Home Assistant
// AUTHOR: LTek
// URL: https://github.com/Ltek/pipup-notify-card
// 
// !! IMPORTANT - READ !!
// only works with these versions of PiPup and PiPup APK...
// Integration... https://github.com/mhoogenbosch/ha-pipup
// APK... https://github.com/mhoogenbosch/PiPup
//
// ============================================================================
// BUILD NUMBER — update on every revision. Format: v<year>.<month>.<day>.<increment>
// The increment is a monotonic version counter — it ALWAYS goes up, never resets
// (even on a new day). Bump date to today AND increment by one each revision.
const BUILD_NUMBER = 'v2026.08.06.44';
// ============================================================================

// Shared configuration definitions
const POSITIONS = {
  0: { label: 'Top-Right', icon: 'mdi:arrow-top-right' },
  1: { label: 'Top-Left', icon: 'mdi:arrow-top-left' },
  2: { label: 'Bottom-Right', icon: 'mdi:arrow-bottom-right' },
  3: { label: 'Bottom-Left', icon: 'mdi:arrow-bottom-left' },
  4: { label: 'Center', icon: 'mdi:arrow-expand' }
};

// The pipup.show `position` field takes a string key, not the legacy integer.
const POSITION_KEYS = {
  0: 'top_right',
  1: 'top_left',
  2: 'bottom_right',
  3: 'bottom_left',
  4: 'center'
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

// pipup.show `urgency` — colored border presets applied on the TV.
const URGENCY_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'info', label: 'Info' },
  { value: 'warning', label: 'Warning' },
  { value: 'critical', label: 'Critical' }
];

let DEBUG = false;

// Profile storage key
const PROFILE_STORAGE_KEY = 'pipup_notify_profiles';

// The built-in profile. It can be edited and selected, but never deleted.
const DEFAULT_PROFILE_NAME = 'Default';

// Load profiles from localStorage, always guaranteeing a non-deletable
// "Default" profile exists at the front of the list.
function loadProfilesWithDefault() {
  let profiles = [];
  try {
    const data = localStorage.getItem(PROFILE_STORAGE_KEY);
    profiles = data ? JSON.parse(data) : [];
  } catch (e) {
    profiles = [];
  }
  if (!Array.isArray(profiles)) profiles = [];
  if (!profiles.some(p => p && p.name === DEFAULT_PROFILE_NAME)) {
    profiles.unshift({ name: DEFAULT_PROFILE_NAME, config: {} });
    try {
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profiles));
    } catch (e) {}
  }
  return profiles;
}

function debugLog(...args) {
  if (DEBUG) console.log('[PiPup]', ...args);
}

// Clamp helper for shadow inputs.
function pipupClamp(v, min, max) {
  v = Number(v);
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
}

// Convert a "#RRGGBB" hex to an rgba() string with the given 0-1 alpha.
function hexToRgba(hex, alpha) {
  const clean = String(hex || '#000000').replace('#', '').slice(-6).padStart(6, '0');
  const r = parseInt(clean.slice(0, 2), 16) || 0;
  const g = parseInt(clean.slice(2, 4), 16) || 0;
  const b = parseInt(clean.slice(4, 6), 16) || 0;
  const a = Number.isFinite(Number(alpha)) ? Number(alpha) : 1;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

// Extract the 6-digit "#RRGGBB" hex (suitable for an <input type="color">) from a
// stored color. Stored colors use the "#AARRGGBB" form (alpha + rgb) e.g. "#CC161616".
function ccColorToHex(color) {
  if (!color) return '#2196F3';
  let c = String(color).replace('#', '');
  // Drop the leading alpha byte when present (AARRGGBB -> RRGGBB)
  if (c.length === 8) c = c.slice(2);
  if (c.length !== 6) return '#2196F3';
  return '#' + c.toUpperCase();
}

// Build a stored "#AARRGGBB" color from a "#RRGGBB" hex + optional alpha byte.
// `alpha` may arrive as a string ("CC"), a number (transparency index), or undefined;
// only a valid 2-hex-digit string is accepted, otherwise it falls back to "CC".
function hexToCcColor(hex, alpha) {
  const clean = String(hex || '#2196F3').replace('#', '').slice(-6);
  let a = 'CC';
  if (typeof alpha === 'string' && /^[0-9a-fA-F]{2}$/.test(alpha)) {
    a = alpha.toUpperCase();
  }
  return '#' + a + clean.toUpperCase();
}

// Strip user-selected substrings (e.g. "PiPup") out of a friendly name for display.
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
  return result.replace(/\s{2,}/g, ' ').trim();
}

// Dynamically discover PiPup TVs
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
      selected_devices: [],
      token: '',
      card_title: 'PiPup Notify',
      card_icon: 'mdi:bell-outline',
      notification_title: 'Home Assistant',
      notification_title_emoji: '',
      default_message: 'Hello from PiPup!',
      default_duration: 10,
      default_position: 3,
      default_background_color: '#CC161616',
      default_transparency: 'CC',
      tts_enabled: false,
      interrupt_enabled: true,
      show_progress: true,
      show_entity_ids: false,
      corner_radius: 18,
      border_width: 2,
      border_color: '#2196F3',
      title_color: '#FFFFFF',
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
      strip_strings: 'PiPup',
      default_media_width: 480,
      default_media_position: 2,
      default_title_alignment: 0,
      default_animation_type: 'fade',
      default_animation_duration: 250,
      // Urgency: '', 'info', 'warning', or 'critical' colored border preset.
      default_urgency: '',
      // Card visual settings
      // card_bg_mode: 'theme' (HA theme default), 'transparent', or 'custom' (card_bg_color).
      card_bg_mode: 'theme',
      card_bg_color: '',
      card_border_enabled: false,
      card_border_width: 1,
      card_border_radius: 12,
      card_border_color: '#2196F3',
      card_border_top: true,
      card_border_bottom: true,
      card_border_left: true,
      card_border_right: true,
      card_glow_enabled: false,
      card_glow_color: '#2196F3',
      card_glow_intensity: 1.0,
      card_glow_borders_only: true,
      card_glow_entity: '',
      // Glow whenever ANY selected/discovered PiPup TV is online.
      card_glow_when_online: false,
      // Plain elevation drop-shadow, independent of the colored Glow effect.
      card_shadow_enabled: false,
      card_shadow_color: '#000000',
      card_shadow_x: 0,
      card_shadow_y: 4,
      card_shadow_blur: 16,
      card_shadow_spread: 0,
      card_shadow_opacity: 0.35, // 0-1 fraction (editor shows as a percentage)
      card_collapsible: false,
      card_show_chevron: true,
      // When true, the title icon doubles as the expand/collapse affordance
      // (it rotates) and the separate chevron is hidden.
      card_title_icon_as_chevron: false,
      card_title_font_size: 16,
      card_title_font_weight: 700,
      card_title_font_style: 'normal',
      card_title_text_color: '#e1e1e1',
      card_title_icon_size: 22,
      // Left indentation (px) for the title icon + text.
      card_title_indent: 0,
      // Title icon color modes: 'fixed' uses card_title_icon_color always;
      // 'status' uses the on/off colors below based on whether any TV is online.
      card_title_icon_color: '#2196F3',
      card_title_icon_color_mode: 'fixed',
      // 'theme' => inherit theme default; 'custom' => use the color value.
      card_title_icon_on_mode: 'custom',
      card_title_icon_on_color: '#4CAF50',
      card_title_icon_off_mode: 'theme',
      card_title_icon_off_color: '#808080',
      // Live Card section visibility (all shown by default).
      show_advanced_settings: true,
      show_message: true,
      show_selected_tvs: true,
      debug: false,
      show_version: false
    };
  }

  constructor() {
    super();
    debugLog('Constructor called');
    this._rendered = false;
    this._config = null;
    this._hass = null;
    this._profiles = [];
    this._currentProfile = null;

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
    this._urgency = '';
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
    this._cardIcon = 'mdi:bell-outline';
    this._notificationTitleEmoji = '';
    this._cardCollapsed = false;

    // Load profiles
    this._loadProfiles();
  }

  _loadProfiles() {
    this._profiles = loadProfilesWithDefault();
  }

  _saveProfiles() {
    try {
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(this._profiles));
    } catch (e) {
      console.warn('[PiPup] Failed to save profiles:', e);
    }
  }

  _saveProfile(name) {
    const profile = {
      name: name,
      config: {
        card_title: this._config.card_title,
        card_icon: this._cardIcon,
        notification_title: this._config.notification_title,
        notification_title_emoji: this._notificationTitleEmoji,
        default_message: this._defaultMessage,
        default_duration: this._duration,
        default_position: this._position,
        default_background_color: this._backgroundColor,
        default_transparency: this._transparency,
        tts_enabled: this._tts,
        interrupt_enabled: this._interrupt,
        show_progress: this._showProgress,
        corner_radius: this._config.corner_radius,
        border_width: this._config.border_width,
        border_color: this._config.border_color,
        title_color: this._config.title_color,
        button1_enabled: this._button1Enabled,
        button1_label: this._button1Label,
        button1_id: this._button1Id,
        button2_enabled: this._button2Enabled,
        button2_label: this._button2Label,
        button2_id: this._button2Id,
        button3_enabled: this._button3Enabled,
        button3_label: this._button3Label,
        button3_id: this._button3Id,
        button_color: this._config.button_color,
        default_media_width: this._config.default_media_width,
        default_media_position: this._config.default_media_position,
        default_title_alignment: this._config.default_title_alignment,
        default_animation_type: this._config.default_animation_type,
        default_animation_duration: this._config.default_animation_duration,
        selected_devices: this._selectedDevices,
        strip_strings: this._config.strip_strings,
        show_entity_ids: this._showEntityIds
      }
    };

    const existing = this._profiles.find(p => p.name === name);
    if (existing) {
      Object.assign(existing, profile);
    } else {
      this._profiles.push(profile);
    }

    this._saveProfiles();
    this._currentProfile = name;
  }

  _loadProfile(name) {
    const profile = this._profiles.find(p => p.name === name);
    if (!profile) return;

    this._currentProfile = name;
    const cfg = profile.config;

    this._config.card_title = cfg.card_title || this._config.card_title;
    this._cardIcon = cfg.card_icon || 'mdi:bell-outline';
    this._config.notification_title = cfg.notification_title || this._config.notification_title;
    this._notificationTitleEmoji = cfg.notification_title_emoji || '';
    this._defaultMessage = cfg.default_message || this._config.default_message;
    this._duration = cfg.default_duration || this._config.default_duration;
    this._position = cfg.default_position !== undefined ? cfg.default_position : this._config.default_position;
    this._backgroundColor = cfg.default_background_color || this._config.default_background_color;
    this._transparency = cfg.default_transparency || this._config.default_transparency;
    this._tts = cfg.tts_enabled !== undefined ? cfg.tts_enabled : this._config.tts_enabled;
    this._interrupt = cfg.interrupt_enabled !== undefined ? cfg.interrupt_enabled : this._config.interrupt_enabled;
    this._showProgress = cfg.show_progress !== undefined ? cfg.show_progress : this._config.show_progress;
    this._showEntityIds = cfg.show_entity_ids !== undefined ? cfg.show_entity_ids : this._config.show_entity_ids;
    this._config.corner_radius = cfg.corner_radius || this._config.corner_radius;
    this._config.border_width = cfg.border_width || this._config.border_width;
    this._config.border_color = cfg.border_color || this._config.border_color;
    this._config.title_color = cfg.title_color || this._config.title_color;
    this._button1Enabled = cfg.button1_enabled || false;
    this._button1Label = cfg.button1_label || '';
    this._button1Id = cfg.button1_id || '';
    this._button2Enabled = cfg.button2_enabled || false;
    this._button2Label = cfg.button2_label || '';
    this._button2Id = cfg.button2_id || '';
    this._button3Enabled = cfg.button3_enabled || false;
    this._button3Label = cfg.button3_label || '';
    this._button3Id = cfg.button3_id || '';
    this._config.button_color = cfg.button_color || this._config.button_color;
    this._config.default_media_width = cfg.default_media_width || this._config.default_media_width;
    this._config.default_media_position = cfg.default_media_position !== undefined ? cfg.default_media_position : this._config.default_media_position;
    this._config.default_title_alignment = cfg.default_title_alignment !== undefined ? cfg.default_title_alignment : this._config.default_title_alignment;
    this._config.default_animation_type = cfg.default_animation_type || this._config.default_animation_type;
    this._config.default_animation_duration = cfg.default_animation_duration !== undefined ? cfg.default_animation_duration : this._config.default_animation_duration;
    this._selectedDevices = cfg.selected_devices || [];
    this._config.strip_strings = cfg.strip_strings || this._config.strip_strings;

    this.renderCard();
  }

  _deleteProfile(name) {
    this._profiles = this._profiles.filter(p => p.name !== name);
    this._saveProfiles();
    if (this._currentProfile === name) {
      this._currentProfile = null;
    }
    this.renderCard();
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
    // Seed the message default only once. Editing "Default Message" in the Visual
    // Editor fires setConfig on every keystroke; re-seeding here would live-update
    // the Live Card's message box, which we don't want.
    if (!this._messageSeeded) {
      this._defaultMessage = this._config.default_message || '';
      this._messageSeeded = true;
    }
    this._cardIcon = this._config.card_icon || 'mdi:bell-outline';
    this._notificationTitleEmoji = this._config.notification_title_emoji || '';
    this._backgroundColor = this._config.default_background_color || '#CC161616';
    this._transparency = this._config.default_transparency || 'CC';
    // Seed the runtime urgency from the config default once (like the message), so
    // a config round-trip doesn't reset a choice the user made on the Live Card.
    if (!this._urgencySeeded) {
      this._urgency = this._config.default_urgency || '';
      this._urgencySeeded = true;
    }
    DEBUG = this._config.debug || false;

    // Collapsible cards start collapsed. Resolve the initial state only once so a
    // later config round-trip doesn't re-collapse a card the user has expanded.
    if (!this._collapseInitialized) {
      this._cardCollapsed = this._config.card_collapsible === true;
      this._collapseInitialized = true;
    }

    this.renderCard();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._rendered) {
      this.renderCard();
      this._rendered = true;
      return;
    }
    this.updateStates();
  }

  getCardSize() {
    return 14;
  }

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

  // pipup.show targets the device's popup binary_sensor (binary_sensor.pipup_*_popup),
  // not the notify.* entity shown in the picker. Resolve one to the other via the
  // shared device_id. Falls back to the given id if no mapping can be found.
  //
  // IMPORTANT: a PiPup device typically exposes TWO binary_sensor entities —
  // the popup (send target) AND a connectivity sensor (used for Online/Offline
  // status elsewhere in this card). Both share platform 'pipup', so matching on
  // platform alone can grab the connectivity sensor instead of the popup one.
  // The service call then succeeds (it's a real pipup entity) but nothing shows
  // on the TV, and HA logs no error. Require an explicit "popup" name match and
  // explicitly exclude device_class:connectivity to avoid that mismatch.
  _getPopupEntityId(entityId) {
    if (entityId && entityId.startsWith('binary_sensor.') && entityId.toLowerCase().includes('popup')) {
      return entityId;
    }
    if (this._hass?.entities) {
      const reg = this._hass.entities[entityId];
      if (reg && reg.device_id) {
        const candidates = Object.values(this._hass.entities).filter(e =>
          e.device_id === reg.device_id && e.entity_id.startsWith('binary_sensor.')
        );
        // Prefer an entity whose id explicitly says "popup".
        let popup = candidates.find(e => e.entity_id.toLowerCase().includes('popup'));
        // Otherwise take any non-connectivity binary_sensor on the device.
        if (!popup) {
          popup = candidates.find(e => {
            const state = this._hass.states[e.entity_id];
            return !(state && state.attributes?.device_class === 'connectivity');
          });
        }
        if (popup) return popup.entity_id;
      }
    }
    // Last-resort fallback: derive binary_sensor.<name>_popup from notify.<name>_notification
    if (entityId.startsWith('notify.')) {
      const guess = 'binary_sensor.' + entityId.slice('notify.'.length).replace(/_notification$/, '') + '_popup';
      if (this._hass?.states?.[guess]) return guess;
    }
    return entityId;
  }

  _getFriendlyName(entityId) {
    if (!this._hass) return entityId;
    // Prefer the DEVICE name (e.g. "Living Room TV") over the entity's own
    // friendly_name, which for a pipup notify entity is just "Notification".
    // This matches how the Visual Editor's discoverPipupTvs() names devices.
    if (this._hass.entities && this._hass.devices) {
      const reg = this._hass.entities[entityId];
      const device = reg && this._hass.devices[reg.device_id];
      if (device && (device.name_by_user || device.name)) {
        return device.name_by_user || device.name;
      }
    }
    const state = this._hass.states[entityId];
    if (state && state.attributes && state.attributes.friendly_name) {
      return state.attributes.friendly_name;
    }
    return entityId;
  }

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

    const state = this._hass.states[entityId];
    if (!state) return 'unknown';

    if (state.state === 'available' || state.state === 'on') {
      return 'online';
    } else if (state.state === 'unavailable' || state.state === 'off') {
      return 'offline';
    }

    return 'unknown';
  }

  // True if ANY discovered PiPup TV reports online. Used by the "glow when online"
  // and status-based title-icon color options.
  _anyTvOnline() {
    const entities = this._getPipupEntities();
    return entities.some(e => this._getDeviceStatus(e.entity_id) === 'online');
  }

  // Build the glow box-shadow string for the current config. `shouldGlow` is the
  // resolved on/off decision. "Borders only" concentrates the glow on the bordered
  // sides (per-side) instead of a diffuse ambient glow; only when borders are on.
  _computeGlowShadow(shouldGlow) {
    if (!shouldGlow) return 'none';
    const config = this._config;
    const color = config.card_glow_color || '#2196F3';
    const intensity = config.card_glow_intensity || 1.0;
    const bordersOnly = (config.card_glow_borders_only !== false) && (config.card_border_enabled === true);
    if (!bordersOnly) {
      return `0 0 ${16 * intensity}px ${-2 * intensity}px ${color}`;
    }
    const blur = 12 * intensity;
    const spread = -4 * intensity;
    const offset = 4 * intensity;
    const parts = [];
    if (config.card_border_top !== false) parts.push(`0 -${offset}px ${blur}px ${spread}px ${color}`);
    if (config.card_border_bottom !== false) parts.push(`0 ${offset}px ${blur}px ${spread}px ${color}`);
    if (config.card_border_left !== false) parts.push(`-${offset}px 0 ${blur}px ${spread}px ${color}`);
    if (config.card_border_right !== false) parts.push(`${offset}px 0 ${blur}px ${spread}px ${color}`);
    return parts.length ? parts.join(', ') : 'none';
  }

  // Build the plain elevation drop-shadow string (or null when disabled).
  _computeDropShadow() {
    const config = this._config;
    if (!config.card_shadow_enabled) return null;
    const sx = Number(config.card_shadow_x) || 0;
    const sy = Number(config.card_shadow_y) || 0;
    const sBlur = Number(config.card_shadow_blur) || 0;
    const sSpread = Number(config.card_shadow_spread) || 0;
    const sOpacity = pipupClamp(config.card_shadow_opacity, 0, 1);
    return `${sx}px ${sy}px ${sBlur}px ${sSpread}px ${hexToRgba(config.card_shadow_color || '#000000', Number.isFinite(sOpacity) ? sOpacity : 0.35)}`;
  }

  sendNotification() {
    const message = this._message || this._defaultMessage || this._config.default_message;
    const duration = this._duration || this._config.default_duration;
    const position = this._position !== undefined ? this._position : this._config.default_position;
    const backgroundColor = this._backgroundColor || this._config.default_background_color;
    const transparency = this._transparency || this._config.default_transparency;
    const tts = this._tts !== undefined ? this._tts : this._config.tts_enabled;
    const interrupt = this._interrupt !== undefined ? this._interrupt : this._config.interrupt_enabled;
    const showProgress = this._showProgress !== undefined ? this._showProgress : this._config.show_progress;
    const imageUri = (this._imageUri || '').trim();
    const videoUri = (this._videoUri || '').trim();

    // Reconstruct the "#AARRGGBB" background from the RGB + selected transparency (alpha).
    const rgb = ccColorToHex(backgroundColor).replace('#', '');
    const bgColor = '#' + (transparency || 'CC') + rgb;

    // Build the payload for the mhoogenbosch/ha-pipup `pipup.show` action.
    const titleEmoji = this._notificationTitleEmoji || this._config.notification_title_emoji || '';
    const data = {
      title: titleEmoji ? `${titleEmoji} ${this._config.notification_title}` : this._config.notification_title,
      message: message,
      duration: duration,
      position: POSITION_KEYS[position] !== undefined ? POSITION_KEYS[position] : 'bottom_left',
      background_color: bgColor,
      title_color: this._config.title_color || '#FFFFFF',
      show_progress: showProgress
    };

    // Media: video/image/web URLs use their own field names in this integration.
    if (videoUri) {
      data.video_url = videoUri;
    } else if (imageUri) {
      data.image_url = imageUri;
    }
    if (imageUri || videoUri) {
      data.media_width = this._config.default_media_width || 480;
    }

    if (tts) {
      data.tts = message;
    }

    // Urgency colored border preset (only sent when set).
    const urgency = this._urgency !== undefined ? this._urgency : this._config.default_urgency;
    if (urgency) {
      data.urgency = urgency;
    }

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
    }

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

    // Only hard-block when the service is missing AND there are no pipup entities.
    // The services map can lag; if entities exist we attempt the call and let HA
    // surface the real error rather than pre-emptively refusing.
    if (!this._hass.services?.pipup?.show && this._getPipupEntities().length === 0) {
      this._logToHA('error', 'pipup.show service not found! Install the PiPup integration.');
      this.showError('❌ pipup.show service not found! Install the PiPup integration.');
      return;
    }

    let successCount = 0;
    let errorCount = 0;
    const totalDevices = selectedDevices.length;

    // pipup.show targets the device's popup binary_sensor, so map each selected
    // notify.* entity to its binary_sensor.pipup_*_popup counterpart.
    const sendPromises = selectedDevices.map(entityId => {
      const popupEntity = this._getPopupEntityId(entityId);
      this._logToHA('info', 'Resolved ' + entityId + ' -> target ' + popupEntity);
      return this._hass.callService('pipup', 'show', data, { entity_id: popupEntity })
        .then(() => {
          successCount++;
          this._logToHA('info', 'Successfully sent to ' + popupEntity);
        })
        .catch(err => {
          errorCount++;
          console.error('[PiPup] Error sending to ' + popupEntity + ':', err);
          this._logToHA('error', 'Failed to send to ' + popupEntity + ': ' + (err.message || 'Unknown error'));
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

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  renderCard() {
    if (!this._hass || !this._config) return;

    const container = document.createElement('div');
    container.className = 'pipup-wrap';

    const config = this._config;
    const message = this._message || this._defaultMessage || config.default_message;
    const duration = this._duration || config.default_duration;
    const position = this._position !== undefined ? this._position : config.default_position;
    const backgroundColor = this._backgroundColor || config.default_background_color;
    const transparency = this._transparency || config.default_transparency;
    const tts = this._tts !== undefined ? this._tts : config.tts_enabled;
    const interrupt = this._interrupt !== undefined ? this._interrupt : config.interrupt_enabled;
    const showProgress = this._showProgress !== undefined ? this._showProgress : config.show_progress;
    const urgency = this._urgency !== undefined ? this._urgency : (config.default_urgency || '');
    const showEntityIds = this._showEntityIds !== undefined ? this._showEntityIds : config.show_entity_ids;

    // Live Card section visibility toggles (default shown).
    const showAdvancedSettings = config.show_advanced_settings !== false;
    const showMessageRow = config.show_message !== false;
    const showSelectedTvs = config.show_selected_tvs !== false;

    const pipupEntities = this._getPipupEntities();

    // Card visual settings
    const cardCollapsible = config.card_collapsible === true;
    const cardBorderEnabled = config.card_border_enabled === true;
    const cardBorderWidth = config.card_border_width || 1;
    const cardBorderRadius = config.card_border_radius || 12;
    const cardBorderColor = config.card_border_color || '#2196F3';
    const cardBorderTop = config.card_border_top !== false;
    const cardBorderBottom = config.card_border_bottom !== false;
    const cardBorderLeft = config.card_border_left !== false;
    const cardBorderRight = config.card_border_right !== false;
    // Background: 'theme' inherits the HA card background; 'transparent' is see-through;
    // 'custom' uses the chosen color.
    const cardBgMode = config.card_bg_mode || (config.card_bg_color ? 'custom' : 'theme');
    const cardBgColor = cardBgMode === 'theme'
      ? 'var(--ha-card-background, var(--card-background-color, transparent))'
      : cardBgMode === 'transparent'
        ? 'transparent'
        : (config.card_bg_color || 'transparent');
    const cardGlowEnabled = config.card_glow_enabled === true;
    const cardGlowColor = config.card_glow_color || '#2196F3';
    const cardGlowIntensity = config.card_glow_intensity || 1.0;
    const cardGlowBordersOnly = config.card_glow_borders_only !== false;
    const cardGlowEntity = config.card_glow_entity || '';
    const cardGlowWhenOnline = config.card_glow_when_online === true;
    const titleTextColor = config.card_title_text_color || '#e1e1e1';
    const titleFontSize = config.card_title_font_size || 16;
    const titleFontWeight = config.card_title_font_weight || 700;
    const titleFontStyle = config.card_title_font_style || 'normal';
    const titleIconSize = config.card_title_icon_size || 22;
    const titleIndent = Number(config.card_title_indent) || 0;

    // Title icon color: 'fixed' => single color; 'status' => on/off colors driven
    // by whether any TV is online. Each status color can defer to the theme.
    const anyOnline = this._anyTvOnline();
    let titleIconColor;
    if (config.card_title_icon_color_mode === 'status') {
      if (anyOnline) {
        titleIconColor = config.card_title_icon_on_mode === 'theme'
          ? 'var(--secondary-text-color, #808080)'
          : (config.card_title_icon_on_color || '#4CAF50');
      } else {
        titleIconColor = config.card_title_icon_off_mode === 'theme'
          ? 'var(--secondary-text-color, #808080)'
          : (config.card_title_icon_off_color || '#808080');
      }
    } else {
      titleIconColor = config.card_title_icon_color || '#2196F3';
    }

    const iconAsChevron = config.card_title_icon_as_chevron === true;
    // Leading title icon shows only when the icon is NOT being repurposed as the
    // chevron (in that case it moves to the trailing/chevron position instead).
    const showLeadingIcon = !iconAsChevron;
    // The separate chevron only shows when the card is collapsible, the chevron is
    // enabled, and the icon isn't taking its place.
    const showChevron = cardCollapsible && config.card_show_chevron !== false && !iconAsChevron;

    let shouldGlow = cardGlowEnabled;
    if (cardGlowEntity && this._hass) {
      const state = this._hass.states[cardGlowEntity];
      shouldGlow = shouldGlow && state && state.state === 'on';
    }
    // "Glow when any TV is online" is an additional trigger, OR-combined with the
    // manual/entity glow so either condition lights the card.
    if (cardGlowWhenOnline && anyOnline) {
      shouldGlow = true;
    }

    // Glow + plain elevation drop-shadow (shared with the live status updater).
    const glowShadow = this._computeGlowShadow(shouldGlow);
    const dropShadow = this._computeDropShadow();

    // The glow and the drop-shadow can both be active; combine into one box-shadow.
    const combinedShadow = [glowShadow !== 'none' ? glowShadow : null, dropShadow]
      .filter(Boolean).join(', ') || 'none';

    const borderCss = cardBorderEnabled ? `
      border-top: ${cardBorderTop ? `${cardBorderWidth}px solid ${cardBorderColor}` : 'none'};
      border-bottom: ${cardBorderBottom ? `${cardBorderWidth}px solid ${cardBorderColor}` : 'none'};
      border-left: ${cardBorderLeft ? `${cardBorderWidth}px solid ${cardBorderColor}` : 'none'};
      border-right: ${cardBorderRight ? `${cardBorderWidth}px solid ${cardBorderColor}` : 'none'};
      border-radius: ${cardBorderRadius}px;
    ` : '';

    const cardStyles = `
      .pipup-wrap {
        --pipup-card-bg: ${cardBgColor};
        --pipup-border: ${borderCss};
        --pipup-glow: ${combinedShadow};
        --pipup-title-color: ${titleTextColor};
        --pipup-title-size: ${titleFontSize}px;
        --pipup-title-weight: ${titleFontWeight};
        --pipup-title-style: ${titleFontStyle};
        --pipup-title-icon-size: ${titleIconSize}px;
        --pipup-title-icon-color: ${titleIconColor};
        --pipup-title-indent: ${titleIndent}px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 8px 0;
        font-family: var(--ha-card-font-family, inherit);
        background: var(--pipup-card-bg);
        ${borderCss}
        box-shadow: var(--pipup-glow);
        overflow: hidden;
      }
      /* Unified color-swatch style: no border on any color box (Editor + Live Card) */
      .pipup-wrap input[type="color"] {
        width: 40px;
        height: 32px;
        border: none;
        padding: 0;
        background: transparent;
        border-radius: 6px;
        cursor: pointer;
      }
      .pipup-wrap input[type="color"]::-webkit-color-swatch-wrapper { padding: 0; }
      .pipup-wrap input[type="color"]::-webkit-color-swatch { border: none; border-radius: 6px; }
      .pipup-wrap input[type="color"]::-moz-color-swatch { border: none; border-radius: 6px; }
      .pipup-title-bar {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        padding-left: calc(12px + var(--pipup-title-indent, 0px));
        cursor: ${cardCollapsible ? 'pointer' : 'default'};
        user-select: none;
        font-size: var(--pipup-title-size);
        font-weight: var(--pipup-title-weight);
        font-style: var(--pipup-title-style);
        color: var(--pipup-title-color);
      }
      .pipup-title-bar ha-icon {
        color: var(--pipup-title-icon-color);
        --mdc-icon-size: var(--pipup-title-icon-size);
      }
      .pipup-title-icon {
        flex-shrink: 0;
      }
      /* When the title icon doubles as the collapse affordance, rotate it. */
      .pipup-title-icon.as-chevron {
        transition: transform 0.25s ease;
      }
      .pipup-title-icon.as-chevron.collapsed {
        transform: rotate(-90deg);
      }
      .pipup-title-text {
        flex: 1;
      }
      .pipup-title-version {
        font-size: 11px;
        font-weight: 400;
        color: var(--secondary-text-color, #808080);
        flex-shrink: 0;
      }
      /* Higher specificity than ".pipup-title-bar ha-icon" so the chevron keeps the
         theme's secondary color instead of the configured title-icon color. */
      .pipup-title-bar ha-icon.pipup-title-chevron {
        transition: transform 0.25s ease;
        color: var(--secondary-text-color, #808080);
        --mdc-icon-size: var(--pipup-title-icon-size);
        flex-shrink: 0;
      }
      .pipup-title-chevron.collapsed {
        transform: rotate(-90deg);
      }
      .pipup-body {
        padding: 0 4px 4px 4px;
        display: ${cardCollapsible && this._cardCollapsed ? 'none' : 'flex'};
        flex-direction: column;
        gap: 8px;
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
      .pipup-row-value input[type="color"] {
        width: 40px;
        padding: 0;
        border: none;
        background: transparent;
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
        padding: 10px 20px;
        margin: 4px 8px;
        background: #2196F3;
        color: white;
        border: none;
        border-radius: 8px;
        font-size: 16px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
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
        flex-wrap: wrap;
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
      .pipup-row-with-unit input[type="range"] {
        flex: 1;
        accent-color: #2196F3;
        cursor: pointer;
      }
      .pipup-row-with-unit .duration-value {
        min-width: 50px;
        text-align: center;
        font-size: 14px;
        color: var(--primary-text-color, #e1e1e1);
      }
      .pipup-button-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 4px 8px;
        flex-wrap: wrap;
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
      .pipup-device-selector {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 4px 8px;
      }
      .pipup-device-selector-label {
        font-size: 16px;
        font-weight: 500;
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
        font-size: 14px;
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
        flex-wrap: wrap;
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
        min-width: 60px;
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
      .pipup-color-chip {
        display: inline-block;
        width: 20px;
        height: 20px;
        border-radius: 4px;
        border: none;
        flex-shrink: 0;
        vertical-align: middle;
        margin-right: 4px;
      }
      .pipup-profile-selector {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 8px;
        flex-wrap: wrap;
      }
      .pipup-profile-selector label {
        font-size: 13px;
        color: var(--secondary-text-color, #808080);
        min-width: 80px;
      }
      .pipup-profile-selector select {
        flex: 1;
        padding: 6px 10px;
        background: var(--secondary-background-color, #2a2a2a);
        border: 1px solid var(--divider-color, #333);
        border-radius: 6px;
        color: var(--primary-text-color, #e1e1e1);
        font-size: 13px;
        cursor: pointer;
      }
      .pipup-collapsible-section {
        border-top: 1px solid var(--divider-color, #333);
        padding: 4px 0;
        margin-top: 4px;
      }
      .pipup-collapsible-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        cursor: pointer;
        user-select: none;
        color: var(--primary-text-color, #e1e1e1);
        font-size: 14px;
        font-weight: 500;
      }
      .pipup-collapsible-header:hover {
        background: rgba(255,255,255,0.03);
        border-radius: 6px;
      }
      .pipup-collapsible-header ha-icon {
        transition: transform 0.25s ease;
        color: var(--secondary-text-color, #808080);
      }
      .pipup-collapsible-header ha-icon.collapsed {
        transform: rotate(-90deg);
      }
      .pipup-collapsible-body {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 0 4px 4px 4px;
      }
      .pipup-collapsible-body.hidden {
        display: none;
      }
      .pipup-template-hint {
        font-size: 11px;
        color: var(--secondary-text-color, #808080);
        padding: 2px 8px 4px 8px;
        font-style: italic;
      }
      .pipup-template-hint code {
        background: var(--secondary-background-color, #2a2a2a);
        padding: 1px 4px;
        border-radius: 3px;
        font-size: 10px;
        color: #64b5f6;
      }
      .pipup-color-picker-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 4px 8px;
      }
      .pipup-color-picker-row label {
        min-width: 80px;
        font-size: 14px;
        color: var(--secondary-text-color, #808080);
      }
      .pipup-transparency-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 4px 8px;
      }
      .pipup-transparency-row label {
        min-width: 80px;
        font-size: 14px;
        color: var(--secondary-text-color, #808080);
      }
      .pipup-transparency-row input[type="range"] {
        flex: 1;
        accent-color: #2196F3;
        cursor: pointer;
      }
      .pipup-transparency-row .transparency-value {
        min-width: 50px;
        text-align: center;
        font-size: 14px;
        color: var(--primary-text-color, #e1e1e1);
      }
    `;

    let html = `<style>${cardStyles}</style>`;

    const cardIcon = this._cardIcon || config.card_icon || 'mdi:bell-outline';
    const cardTitleDisplay = config.card_title || 'PiPup Notify';

    // When "use title icon in place of chevron" is on, the icon renders in the
    // trailing (chevron) slot instead of leading the title. It rotates like a
    // chevron only when the card is collapsible; otherwise it's a static trailing icon.
    const trailingIconRotates = iconAsChevron && cardCollapsible;
    const leadingIconHtml = showLeadingIcon
      ? `<ha-icon id="pipup-title-icon" class="pipup-title-icon" icon="${cardIcon}"></ha-icon>`
      : '';
    const trailingIconHtml = iconAsChevron
      ? `<ha-icon id="pipup-title-icon" class="pipup-title-icon pipup-title-icon-trailing${trailingIconRotates ? ` as-chevron${this._cardCollapsed ? ' collapsed' : ''}` : ''}" icon="${cardIcon}"></ha-icon>`
      : '';

    html += `
      <div class="pipup-title-bar" id="pipup-title-bar">
        ${leadingIconHtml}
        <span class="pipup-title-text">${this._escapeHtml(cardTitleDisplay)}</span>
        ${config.show_version ? `<span class="pipup-title-version">${BUILD_NUMBER}</span>` : ''}
        ${trailingIconHtml}
        ${showChevron ? `<ha-icon class="pipup-title-chevron ${this._cardCollapsed ? 'collapsed' : ''}" icon="mdi:chevron-down"></ha-icon>` : ''}
      </div>
      <div class="pipup-body" id="pipup-body">
        <div class="pipup-error" id="pipup-error"></div>
    `;

    html += `
      <div class="pipup-profile-selector">
        <label><ha-icon icon="mdi:playlist-check" style="--mdc-icon-size:18px;vertical-align:middle;"></ha-icon> Profile:</label>
        <select id="pipup-profile-select">
          <option value="">-- Manual --</option>
          ${this._profiles.map(p => `
            <option value="${this._escapeHtml(p.name)}" ${this._currentProfile === p.name ? 'selected' : ''}>
              ${this._escapeHtml(p.name)}
            </option>
          `).join('')}
        </select>
      </div>
    `;

    if (showSelectedTvs) html += `
      <div class="pipup-device-selector">
        <span class="pipup-device-selector-label"><ha-icon icon="mdi:television" style="--mdc-icon-size:18px;vertical-align:middle;"></ha-icon> Target TVs</span>
        ${pipupEntities.length > 0 ? pipupEntities.map(entity => {
          const friendlyName = stripName(this._getFriendlyName(entity.entity_id), this._config.strip_strings);
          const isSelected = this._selectedDevices.includes(entity.entity_id);
          const status = this._getDeviceStatus(entity.entity_id);
          const statusClass = status === 'online' ? 'online' : (status === 'offline' ? 'offline' : 'unknown');
          const statusIcon = status === 'online' ? 'mdi:circle' : (status === 'offline' ? 'mdi:circle-outline' : 'mdi:help-circle-outline');
          const statusText = status === 'online' ? 'Online' : (status === 'offline' ? 'Offline' : 'Unknown');

          return `
            <div class="pipup-device-item">
              <input type="checkbox" class="device-checkbox" value="${entity.entity_id}" ${isSelected ? 'checked' : ''}>
              <span class="device-name">${this._escapeHtml(friendlyName)}</span>
              <span class="device-id">${entity.entity_id}</span>
              <span class="device-status ${statusClass}"><ha-icon icon="${statusIcon}" style="--mdc-icon-size:11px;vertical-align:middle;"></ha-icon> ${statusText}</span>
            </div>
          `;
        }).join('') : `
          <div style="padding:8px;color:var(--secondary-text-color, #808080);font-style:italic;">
            No PiPup devices found. Make sure the integration is configured.
          </div>
        `}
      </div>
    `;

    // The pipup.show service can register late (or be namespaced differently), so
    // don't warn purely on its absence. If PiPup notify entities exist, the
    // integration is clearly installed — only warn when neither is present.
    const hasPipupService = !!(this._hass?.services?.pipup?.show);
    const hasPipupEntities = pipupEntities.length > 0;
    if (!hasPipupService && !hasPipupEntities) {
      html += `
        <div class="pipup-config-notice" style="display:flex;align-items:center;gap:6px;background:rgba(244,67,54,0.1);border:1px solid #f44336;border-radius:6px;color:#f44336;padding:8px 12px;margin:4px 8px;font-size:13px;">
          <ha-icon icon="mdi:alert" style="--mdc-icon-size:16px;"></ha-icon> PiPup integration not found! Install via HACS.
        </div>
      `;
    }

    if (showMessageRow) html += `
      <div class="pipup-row">
        <span class="pipup-row-label">Message</span>
        <div class="pipup-row-value">
          <input type="text" id="pipup-message" value="${this._escapeHtml(message)}" placeholder="Enter message...">
        </div>
      </div>
      <div class="pipup-template-hint">
        <ha-icon icon="mdi:lightbulb-on-outline" style="--mdc-icon-size:13px;vertical-align:middle;"></ha-icon> Supports Jinja templates. See example in the Visual Editor.
      </div>
    `;

    html += `
      <button class="pipup-send-btn" id="pipup-send">
        <ha-icon icon="mdi:send"></ha-icon>
        Send Notification
      </button>
    `;

    if (showAdvancedSettings) html += `
      <div class="pipup-collapsible-section">
        <div class="pipup-collapsible-header" id="pipup-settings-toggle">
          <ha-icon icon="mdi:cog-outline" id="pipup-settings-icon"></ha-icon>
          <span>Advanced Settings</span>
        </div>
        <div class="pipup-collapsible-body hidden" id="pipup-settings-body">
    `;

    if (showAdvancedSettings) html += `
      <div class="pipup-row">
        <span class="pipup-row-label">Display Time</span>
        <div class="pipup-row-value">
          <div class="pipup-row-with-unit">
            <input type="range" id="pipup-duration-slider" min="0" max="60" value="${duration}">
            <span class="duration-value" id="pipup-duration-value">${duration}s</span>
          </div>
        </div>
      </div>
    `;

    if (showAdvancedSettings) html += `
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
    `;

    if (showAdvancedSettings) html += `
      <div class="pipup-row">
        <span class="pipup-row-label">Urgency</span>
        <div class="pipup-row-value">
          <select id="pipup-urgency">
            ${URGENCY_OPTIONS.map(opt => `
              <option value="${opt.value}" ${urgency === opt.value ? 'selected' : ''}>${opt.label}</option>
            `).join('')}
          </select>
        </div>
      </div>
    `;

    // Color picker - use hex format for the color input
    const hexColor = ccColorToHex(backgroundColor);
    if (showAdvancedSettings) html += `
      <div class="pipup-color-picker-row">
        <label>Color</label>
        <input type="color" id="pipup-color" value="${hexColor}">
        <span style="font-size:13px;color:var(--secondary-text-color, #808080);">Background</span>
      </div>
    `;

    const transIdx = TRANSPARENCY_OPTIONS.findIndex(t => t.value === transparency);
    if (showAdvancedSettings) html += `
      <div class="pipup-transparency-row">
        <label>Transparency</label>
        <input type="range" id="pipup-transparency" min="0" max="5" step="1" value="${transIdx >= 0 ? transIdx : 4}">
        <span class="transparency-value" id="pipup-transparency-value">${TRANSPARENCY_OPTIONS[transIdx >= 0 ? transIdx : 4].label}</span>
      </div>
    `;

    if (showAdvancedSettings) html += `
      <div class="pipup-toggle-row">
        <label>
          <input type="checkbox" id="pipup-show-progress" ${showProgress ? 'checked' : ''}>
          <ha-icon icon="mdi:progress-clock" style="--mdc-icon-size:16px;vertical-align:middle;"></ha-icon> Show progress bar
        </label>
        <label>
          <input type="checkbox" id="pipup-tts" ${tts ? 'checked' : ''}>
          <ha-icon icon="mdi:volume-high" style="--mdc-icon-size:16px;vertical-align:middle;"></ha-icon> Speak aloud (TTS)
        </label>
        <label>
          <input type="checkbox" id="pipup-interrupt" ${interrupt ? 'checked' : ''}>
          <ha-icon icon="mdi:gesture-tap" style="--mdc-icon-size:16px;vertical-align:middle;"></ha-icon> Dismissible
        </label>
      </div>
    `;

    if (showAdvancedSettings) html += `
      <hr class="pipup-divider">
      <div class="pipup-button-section">
        <div class="pipup-button-section-label"><ha-icon icon="mdi:gesture-tap-button" style="--mdc-icon-size:16px;vertical-align:middle;"></ha-icon> Action Buttons</div>

        <div class="pipup-button-row-inline">
          <label>
            <input type="checkbox" class="button-enable" data-button="1" ${this._button1Enabled ? 'checked' : ''}>
            #1
          </label>
          <input type="text" class="button-label" data-button="1" value="${this._escapeHtml(this._button1Label || '')}" placeholder="Label">
          <input type="text" class="button-id" data-button="1" value="${this._escapeHtml(this._button1Id || '')}" placeholder="ID" class="btn-id">
        </div>

        <div class="pipup-button-row-inline">
          <label>
            <input type="checkbox" class="button-enable" data-button="2" ${this._button2Enabled ? 'checked' : ''}>
            #2
          </label>
          <input type="text" class="button-label" data-button="2" value="${this._escapeHtml(this._button2Label || '')}" placeholder="Label">
          <input type="text" class="button-id" data-button="2" value="${this._escapeHtml(this._button2Id || '')}" placeholder="ID" class="btn-id">
        </div>

        <div class="pipup-button-row-inline">
          <label>
            <input type="checkbox" class="button-enable" data-button="3" ${this._button3Enabled ? 'checked' : ''}>
            #3
          </label>
          <input type="text" class="button-label" data-button="3" value="${this._escapeHtml(this._button3Label || '')}" placeholder="Label">
          <input type="text" class="button-id" data-button="3" value="${this._escapeHtml(this._button3Id || '')}" placeholder="ID" class="btn-id">
        </div>

        <div class="pipup-row" style="padding-top:4px;">
          <span class="pipup-row-label" style="min-width:80px;font-size:13px;">Button Color</span>
          <div class="pipup-row-value">
            <input type="color" id="pipup-button-color" value="${this._config.button_color || '#1565C0'}">
          </div>
        </div>
      </div>
      <div style="font-size:11px;color:var(--secondary-text-color);padding:0 8px 4px;">
        <ha-icon icon="mdi:lightbulb-on-outline" style="--mdc-icon-size:13px;vertical-align:middle;"></ha-icon> Buttons fire a <code>pipup_button</code> event. Use automation to react: <code>event_type: pipup_button</code>
      </div>
    `;

    if (showAdvancedSettings) html += `
      <hr class="pipup-divider">
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
        <ha-icon icon="mdi:lightbulb-on-outline" style="--mdc-icon-size:13px;vertical-align:middle;"></ha-icon> If both are set, the video stream takes priority.
      </div>
    `;

    if (showAdvancedSettings) html += `
        </div>
      </div>
    `;

    html += `</div></div>`;

    container.innerHTML = html;
    this.innerHTML = '';
    this.appendChild(container);
    this._rendered = true;

    this.attachEventListeners();
  }

  attachEventListeners() {
    const messageInput = this.querySelector('#pipup-message');
    const imageUriInput = this.querySelector('#pipup-image-uri');
    const videoUriInput = this.querySelector('#pipup-video-uri');
    const durationSlider = this.querySelector('#pipup-duration-slider');
    const durationValue = this.querySelector('#pipup-duration-value');
    const positionSelect = this.querySelector('#pipup-position');
    const urgencySelect = this.querySelector('#pipup-urgency');
    const colorPicker = this.querySelector('#pipup-color');
    const transparencySlider = this.querySelector('#pipup-transparency');
    const transparencyValue = this.querySelector('#pipup-transparency-value');
    const showProgressToggle = this.querySelector('#pipup-show-progress');
    const ttsToggle = this.querySelector('#pipup-tts');
    const interruptToggle = this.querySelector('#pipup-interrupt');
    const buttonColor = this.querySelector('#pipup-button-color');
    const sendBtn = this.querySelector('#pipup-send');
    const profileSelect = this.querySelector('#pipup-profile-select');
    const titleBar = this.querySelector('#pipup-title-bar');
    const settingsToggle = this.querySelector('#pipup-settings-toggle');
    const settingsBody = this.querySelector('#pipup-settings-body');
    const settingsIcon = this.querySelector('#pipup-settings-icon');
    const chevron = this.querySelector('.pipup-title-chevron');
    const titleIcon = this.querySelector('#pipup-title-icon');
    const body = this.querySelector('#pipup-body');

    if (titleBar && this._config.card_collapsible) {
      titleBar.addEventListener('click', () => {
        this._cardCollapsed = !this._cardCollapsed;
        if (body) {
          body.style.display = this._cardCollapsed ? 'none' : 'flex';
        }
        if (chevron) {
          chevron.classList.toggle('collapsed', this._cardCollapsed);
        }
        // If the title icon doubles as the chevron, rotate it too.
        if (titleIcon && titleIcon.classList.contains('as-chevron')) {
          titleIcon.classList.toggle('collapsed', this._cardCollapsed);
        }
      });
    }

    if (settingsToggle && settingsBody) {
      let settingsOpen = false;
      settingsToggle.addEventListener('click', () => {
        settingsOpen = !settingsOpen;
        settingsBody.classList.toggle('hidden', !settingsOpen);
        if (settingsIcon) {
          settingsIcon.style.transform = settingsOpen ? 'rotate(90deg)' : 'rotate(0deg)';
        }
      });
    }

    if (profileSelect) {
      profileSelect.addEventListener('change', () => {
        const name = profileSelect.value;
        if (name) {
          this._loadProfile(name);
          this.renderCard();
        } else {
          this._currentProfile = null;
          this._message = '';
          this._defaultMessage = this._config.default_message;
          this._duration = this._config.default_duration;
          this._position = this._config.default_position;
          this._backgroundColor = this._config.default_background_color;
          this._transparency = this._config.default_transparency;
          this._tts = this._config.tts_enabled;
          this._interrupt = this._config.interrupt_enabled;
          this._showProgress = this._config.show_progress;
          this._selectedDevices = this._config.selected_devices || [];
          this.renderCard();
        }
      });
    }

    this.querySelectorAll('.device-checkbox').forEach(cb => {
      cb.onchange = () => {
        this._selectedDevices = [...this.querySelectorAll('.device-checkbox:checked')]
          .map(el => el.value);
        this._config.selected_devices = this._selectedDevices;
      };
    });

    this.querySelectorAll('.button-enable').forEach(cb => {
      cb.onchange = () => {
        const btnNum = cb.dataset.button;
        if (btnNum === '1') this._button1Enabled = cb.checked;
        else if (btnNum === '2') this._button2Enabled = cb.checked;
        else if (btnNum === '3') this._button3Enabled = cb.checked;
        this._config['button' + btnNum + '_enabled'] = cb.checked;
      };
    });

    this.querySelectorAll('.button-label').forEach(input => {
      input.onchange = () => {
        const btnNum = input.dataset.button;
        if (btnNum === '1') this._button1Label = input.value;
        else if (btnNum === '2') this._button2Label = input.value;
        else if (btnNum === '3') this._button3Label = input.value;
        this._config['button' + btnNum + '_label'] = input.value;
      };
    });

    this.querySelectorAll('.button-id').forEach(input => {
      input.onchange = () => {
        const btnNum = input.dataset.button;
        if (btnNum === '1') this._button1Id = input.value;
        else if (btnNum === '2') this._button2Id = input.value;
        else if (btnNum === '3') this._button3Id = input.value;
        this._config['button' + btnNum + '_id'] = input.value;
      };
    });

    if (messageInput) {
      messageInput.onchange = () => {
        this._message = messageInput.value;
        this._defaultMessage = messageInput.value;
      };
    }

    if (imageUriInput) {
      imageUriInput.onchange = () => { this._imageUri = imageUriInput.value; };
    }

    if (videoUriInput) {
      videoUriInput.onchange = () => { this._videoUri = videoUriInput.value; };
    }

    if (durationSlider && durationValue) {
      durationSlider.oninput = () => {
        this._duration = parseInt(durationSlider.value) || 0;
        durationValue.textContent = `${this._duration}s`;
      };
    }

    if (positionSelect) {
      positionSelect.onchange = () => {
        this._position = parseInt(positionSelect.value);
      };
    }

    if (urgencySelect) {
      urgencySelect.onchange = () => {
        this._urgency = urgencySelect.value;
      };
    }

    if (colorPicker) {
      colorPicker.oninput = () => {
        // Preserve the current transparency (alpha) byte while updating the RGB.
        this._backgroundColor = hexToCcColor(colorPicker.value, this._transparency);
      };
    }

    if (transparencySlider && transparencyValue) {
      transparencySlider.oninput = () => {
        const idx = parseInt(transparencySlider.value) || 0;
        const opt = TRANSPARENCY_OPTIONS[idx] || TRANSPARENCY_OPTIONS[4];
        this._transparency = opt.value;
        transparencyValue.textContent = opt.label;
      };
    }

    if (showProgressToggle) {
      showProgressToggle.onchange = () => { this._showProgress = showProgressToggle.checked; };
    }

    if (ttsToggle) {
      ttsToggle.onchange = () => { this._tts = ttsToggle.checked; };
    }

    if (interruptToggle) {
      interruptToggle.onchange = () => { this._interrupt = interruptToggle.checked; };
    }

    if (buttonColor) {
      buttonColor.onchange = () => {
        this._config.button_color = buttonColor.value;
      };
    }

    if (sendBtn) {
      sendBtn.onclick = () => {
        if (messageInput) {
          this._message = messageInput.value;
          this._defaultMessage = messageInput.value;
        }
        if (imageUriInput) this._imageUri = imageUriInput.value;
        if (videoUriInput) this._videoUri = videoUriInput.value;
        if (durationSlider) this._duration = parseInt(durationSlider.value) || 0;
        if (positionSelect) this._position = parseInt(positionSelect.value);
        if (urgencySelect) this._urgency = urgencySelect.value;
        if (colorPicker) {
          this._backgroundColor = hexToCcColor(colorPicker.value, this._transparency);
        }
        if (transparencySlider) {
          const idx = parseInt(transparencySlider.value) || 0;
          this._transparency = TRANSPARENCY_OPTIONS[idx]?.value || 'CC';
        }
        if (showProgressToggle) this._showProgress = showProgressToggle.checked;
        if (ttsToggle) this._tts = ttsToggle.checked;
        if (interruptToggle) this._interrupt = interruptToggle.checked;
        if (buttonColor) this._config.button_color = buttonColor.value;

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

        this._selectedDevices = [...this.querySelectorAll('.device-checkbox:checked')]
          .map(el => el.value);
        this._config.selected_devices = this._selectedDevices;

        this.sendNotification();
      };
    }
  }

  updateStates() {
    const pipupEntities = this._getPipupEntities();

    const deviceItems = this.querySelectorAll('.pipup-device-item');
    deviceItems.forEach((item, index) => {
      if (index < pipupEntities.length) {
        const entity = pipupEntities[index];
        const status = this._getDeviceStatus(entity.entity_id);
        const statusEl = item.querySelector('.device-status');
        if (statusEl) {
          const statusClass = status === 'online' ? 'online' : (status === 'offline' ? 'offline' : 'unknown');
          const statusIcon = status === 'online' ? 'mdi:circle' : (status === 'offline' ? 'mdi:circle-outline' : 'mdi:help-circle-outline');
          const statusText = status === 'online' ? 'Online' : (status === 'offline' ? 'Offline' : 'Unknown');
          statusEl.className = `device-status ${statusClass}`;
          statusEl.innerHTML = `<ha-icon icon="${statusIcon}" style="--mdc-icon-size:11px;vertical-align:middle;"></ha-icon> ${statusText}`;
        }
      }
    });

    // Live-update the status-driven visuals (glow-when-online and the title icon
    // on/off color) without a full re-render, so they track TV state changes.
    this._updateStatusVisuals();
  }

  // Recompute the "glow when online" box-shadow and status-based title-icon color
  // against the current TV online state and apply them to the live DOM.
  _updateStatusVisuals() {
    const config = this._config;
    if (!config) return;
    const wrap = this.querySelector('.pipup-wrap');
    const anyOnline = this._anyTvOnline();

    // Title icon color when in 'status' mode.
    if (config.card_title_icon_color_mode === 'status' && wrap) {
      let color;
      if (anyOnline) {
        color = config.card_title_icon_on_mode === 'theme'
          ? 'var(--secondary-text-color, #808080)'
          : (config.card_title_icon_on_color || '#4CAF50');
      } else {
        color = config.card_title_icon_off_mode === 'theme'
          ? 'var(--secondary-text-color, #808080)'
          : (config.card_title_icon_off_color || '#808080');
      }
      wrap.style.setProperty('--pipup-title-icon-color', color);
    }

    // Glow-when-online: recompute the combined box-shadow if that trigger is on,
    // reusing the same glow/shadow builders as the initial render.
    if (config.card_glow_when_online && wrap) {
      let shouldGlow = config.card_glow_enabled === true;
      if (config.card_glow_entity && this._hass) {
        const s = this._hass.states[config.card_glow_entity];
        shouldGlow = shouldGlow && s && s.state === 'on';
      }
      if (anyOnline) shouldGlow = true;
      const glowShadow = this._computeGlowShadow(shouldGlow);
      const dropShadow = this._computeDropShadow();
      const combined = [glowShadow !== 'none' ? glowShadow : null, dropShadow].filter(Boolean).join(', ') || 'none';
      wrap.style.setProperty('--pipup-glow', combined);
    }
  }

  // ============ EDITOR ============
  static getConfigElement() {
    return document.createElement('pipup-notify-card-editor');
  }
}

// ============ EDITOR CLASS ============
class PipupNotifyCardEditor extends HTMLElement {
  constructor() {
    super();
    this._config = {};
    this._hass = null;
    this._lastTvKey = null;
    // TV selection used only by the Profile Creator. Kept separate from
    // this._config so toggling a TV in the editor never fires config-changed
    // for selected_devices and therefore never alters the Live Card (req 3).
    this._profileSelectedDevices = [];
  }

  setConfig(config) {
    this._config = { ...config };
    // Adopt the incoming selected_devices into the Profile Creator's local
    // selection only when it actually changed (e.g. a profile was just loaded).
    // On plain field-edit round-trips selected_devices is unchanged, so we
    // preserve any in-progress TV checks the user made before saving (req 3).
    const incoming = Array.isArray(config.selected_devices) ? config.selected_devices : [];
    const incomingKey = incoming.slice().sort().join(',');
    if (this._profileSelectedDevices === undefined || incomingKey !== this._lastConfigDevicesKey) {
      this._profileSelectedDevices = [...incoming];
    }
    this._lastConfigDevicesKey = incomingKey;

    // A field edit inside the editor fires config-changed, which HA echoes back
    // here via setConfig. Rebuilding the whole editor on every keystroke would
    // steal focus and reset collapse/scroll state. When the change originated
    // from our own _fire(), just absorb the config and skip the re-render.
    if (this._skipNextRender) {
      this._skipNextRender = false;
      return;
    }
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._updateTvList();
  }

  get hass() {
    return this._hass;
  }

  // Push a config change to Home Assistant WITHOUT triggering a full editor
  // rebuild when HA echoes it back. The DOM already reflects the user's edit.
  _fire(config) {
    this._config = { ...config };
    this._skipNextRender = true;
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
    const selectedDevices = this._profileSelectedDevices || [];
    const showIds = this._config.show_entity_ids === true;
    return tvs.map(tv => {
      const displayName = stripName(tv.friendlyName, stripStrings);
      const statusColor = tv.status === 'online' ? '#4CAF50' : (tv.status === 'offline' ? '#f44336' : 'var(--secondary-text-color, #808080)');
      const statusText = tv.status === 'online' ? 'Online' : (tv.status === 'offline' ? 'Offline' : 'Unknown');
      const statusIcon = tv.status === 'online' ? 'mdi:circle' : (tv.status === 'offline' ? 'mdi:circle-outline' : 'mdi:help-circle-outline');
      const isSelected = selectedDevices.includes(tv.entityId);
      return `
        <div style="display:flex;align-items:center;gap:8px;padding:6px 4px;border-top:1px solid #333;">
          <input type="checkbox" class="device-checkbox" value="${tv.entityId}" ${isSelected ? 'checked' : ''} style="accent-color:#2196F3;cursor:pointer;">
          <div style="display:flex;flex-direction:column;flex:1;">
            <span style="color:var(--primary-text-color);font-size:13px;">${displayName}</span>
            <span style="color:var(--secondary-text-color, #808080);font-size:11px;display:${showIds ? 'inline' : 'none'};">${tv.entityId}</span>
          </div>
          <span style="color:${statusColor};font-size:12px;font-weight:500;white-space:nowrap;display:inline-flex;align-items:center;gap:4px;"><ha-icon icon="${statusIcon}" style="--mdc-icon-size:12px;"></ha-icon>${statusText}</span>
        </div>
      `;
    }).join('');
  }

  // Only rebuild the TV list when the actual set/status of devices changes so that a
  // hass update never clobbers a checkbox the user just toggled.
  _updateTvList() {
    const el = this.querySelector('#editor-tv-list');
    if (!el) return;
    const tvs = discoverPipupTvs(this._hass);
    const key = tvs.map(t => `${t.entityId}:${t.status}`).join(',');
    if (key === this._lastTvKey) return;
    this._lastTvKey = key;
    el.innerHTML = this._renderTvListInner();
    this._attachDeviceCheckboxListeners();
  }

  _attachDeviceCheckboxListeners() {
    this.querySelectorAll('#editor-tv-list .device-checkbox').forEach(cb => {
      cb.onchange = () => {
        // Track selection locally for the Profile Creator only. Do NOT write to
        // this._config or fire config-changed — that would push the selection to
        // the Live Card (req 3). It is captured into a profile only on Save.
        this._profileSelectedDevices = [...this.querySelectorAll('#editor-tv-list .device-checkbox:checked')]
          .map(el => el.value);
      };
    });
  }

  _section(icon, title, id, bodyHtml, opts = {}) {
    const borderColor = opts.border || '#333';
    const headerColor = opts.color ? `color:${opts.color};` : 'color:var(--primary-text-color);';
    // All sections start collapsed. One is expanded at a time (accordion). If a
    // section was open before a re-render (e.g. loading a profile), keep it open.
    const collapsed = this._openSection === id ? '' : ' collapsed';
    return `
      <div class="pip-sec${collapsed}" style="border-color:${borderColor};">
        <div class="pip-sec-header" data-target="${id}" style="${headerColor}">
          <ha-icon icon="${icon}"></ha-icon>
          <span>${title}</span>
          <ha-icon class="chev" icon="mdi:chevron-down"></ha-icon>
        </div>
        <div class="pip-sec-body" id="${id}">
          ${opts.desc ? `<div style="font-size:12px;color:var(--secondary-text-color, #808080);margin-bottom:8px;">${opts.desc}</div>` : ''}
          ${bodyHtml}
        </div>
      </div>
    `;
  }

  _renderProfileChips(profiles) {
    return profiles.map(p => {
      const isDefault = p.name === DEFAULT_PROFILE_NAME;
      return `
        <span class="editor-profile-tag" data-name="${this._escapeHtml(p.name)}" style="display:inline-flex;align-items:center;gap:6px;background:rgba(33,150,243,0.15);border:1px solid #2196F3;border-radius:999px;padding:3px 10px;font-size:12px;color:#64b5f6;cursor:pointer;">
          <ha-icon icon="${isDefault ? 'mdi:folder-star' : 'mdi:folder-outline'}" style="--mdc-icon-size:14px;"></ha-icon>
          ${this._escapeHtml(p.name)}
          ${isDefault
            ? `<ha-icon icon="mdi:lock" style="--mdc-icon-size:12px;opacity:0.7;" title="Default profile cannot be deleted"></ha-icon>`
            : `<span class="remove" data-name="${this._escapeHtml(p.name)}" style="cursor:pointer;opacity:0.7;font-weight:bold;">×</span>`}
        </span>
      `;
    }).join('');
  }

  // Rebuild only the profile chip list + wire its listeners, without touching the
  // rest of the editor DOM (so saving/deleting a profile doesn't reset the form).
  _refreshProfileChips() {
    const list = this.querySelector('#editor-profile-list');
    if (!list) return;
    list.innerHTML = this._renderProfileChips(loadProfilesWithDefault());
    this._attachProfileChipListeners();
  }

  _attachProfileChipListeners() {
    this.querySelectorAll('.editor-profile-tag').forEach(tag => {
      tag.onclick = (e) => {
        if (e.target.classList.contains('remove')) return;
        const name = tag.dataset.name;
        if (name) {
          try {
            const data = localStorage.getItem(PROFILE_STORAGE_KEY);
            const profiles = data ? JSON.parse(data) : [];
            const profile = profiles.find(p => p.name === name);
            if (profile) {
              const newConfig = { ...this._config, ...profile.config, active_profile: name };
              // Render the whole editor to reflect the loaded values, THEN fire
              // (which sets the skip flag so HA's echo doesn't rebuild again).
              this._skipNextRender = false;
              this.setConfig(newConfig);
              this._fire(newConfig);
            }
          } catch (e) {}
        }
      };
      const removeBtn = tag.querySelector('.remove');
      if (removeBtn) {
        removeBtn.onclick = (e) => {
          e.stopPropagation();
          const name = removeBtn.dataset.name;
          if (name && name !== DEFAULT_PROFILE_NAME) {
            try {
              let profiles = loadProfilesWithDefault();
              profiles = profiles.filter(p => p.name !== name);
              localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profiles));
              // Only the chip list changed — refresh it in place, no full rebuild.
              this._refreshProfileChips();
            } catch (e) {}
          }
        };
      }
    });
  }

  _render() {
    const cfg = this._config;
    const hasToken = !!(cfg.token && cfg.token.trim());

    const profiles = loadProfilesWithDefault();

    const transIdx = TRANSPARENCY_OPTIONS.findIndex(t => t.value === (cfg.default_transparency || 'CC'));

    const styleBlock = `
      <style>
        .pipup-editor { padding:16px; display:flex; flex-direction:column; gap:12px; }
        /* Icons sit slightly larger than the text they accompany, and align to it. */
        .pipup-editor ha-icon { --mdc-icon-size:18px; vertical-align:middle; }
        .pip-sec-header { font-size:15px; }
        .pip-sec-header ha-icon { --mdc-icon-size:22px; }
        .pip-sub-label ha-icon { --mdc-icon-size:17px; }
        .pip-behavior-row ha-icon { --mdc-icon-size:19px; }
        .pipup-editor input[type="color"] {
          width:40px; height:32px; padding:0; border:none;
          background:transparent; border-radius:6px; cursor:pointer;
        }
        .pipup-editor input[type="color"]::-webkit-color-swatch-wrapper { padding:0; }
        .pipup-editor input[type="color"]::-webkit-color-swatch { border:none; border-radius:6px; }
        .pipup-editor input[type="color"]::-moz-color-swatch { border:none; border-radius:6px; }
        .pip-sec {
          border:1px solid #333; border-radius:8px;
          background:var(--ha-card-background, #1a1a1a); overflow:hidden;
        }
        .pip-sec-header {
          display:flex; align-items:center; gap:8px; padding:12px;
          cursor:pointer; user-select:none; font-weight:500;
        }
        .pip-sec-header:hover { background:rgba(255,255,255,0.03); }
        .pip-sec-header .chev {
          margin-left:auto; transition:transform 0.2s ease;
          color:var(--secondary-text-color, #808080);
        }
        .pip-sec.collapsed .pip-sec-header .chev { transform:rotate(-90deg); }
        .pip-sec-body { padding:0 12px 12px 12px; }
        .pip-sec.collapsed .pip-sec-body { display:none; }
        .pip-sub {
          border-top:1px solid #333; padding-top:8px; margin-top:8px;
        }
        .pip-sub-label {
          font-size:13px; font-weight:500; color:var(--primary-text-color); margin-bottom:4px;
        }
        .pip-row {
          display:flex; align-items:center; gap:12px; padding:4px 0; flex-wrap:wrap;
        }
        .pip-row label.lbl {
          min-width:100px; color:var(--primary-text-color); font-size:13px;
        }
        .pip-row input[type="text"],
        .pip-row input[type="password"],
        .pip-row select {
          flex:1; padding:6px 10px; background:var(--secondary-background-color, #2a2a2a);
          border:1px solid #333; border-radius:4px; color:var(--primary-text-color); font-size:13px;
        }
        .pip-row input[type="range"] { flex:1; max-width:200px; accent-color:#2196F3; cursor:pointer; }
        .pip-val { font-size:12px; color:var(--secondary-text-color, #808080); }
        .pip-hint { font-size:11px; color:var(--secondary-text-color, #808080); }
        .pip-check {
          display:flex; align-items:center; gap:6px; color:var(--primary-text-color);
          font-size:13px; cursor:pointer;
        }
        .pip-check input[type="checkbox"] { width:16px; height:16px; cursor:pointer; accent-color:#2196F3; }
        /* Behavior toggles styled like the Live Card */
        .pip-behavior-row { display:flex; align-items:center; gap:16px; padding:4px 0; flex-wrap:wrap; }
        .pip-behavior-row label {
          display:flex; align-items:center; gap:6px; color:var(--primary-text-color);
          font-size:14px; cursor:pointer;
        }
        .pip-behavior-row input[type="checkbox"] { width:18px; height:18px; cursor:pointer; accent-color:#2196F3; }
      </style>
    `;

    // --- Card Settings body ---
    const cardVisualsBody = `
      <div class="pip-sub" style="border-top:none;padding-top:0;margin-top:0;">
        <div class="pip-sub-label">Section Display Options</div>
        <div class="pip-hint" style="margin-bottom:6px;">Show or hide areas of the Live Card.</div>
        <div class="pip-row">
          <label class="pip-check"><input type="checkbox" id="editor-show-advanced-settings" ${cfg.show_advanced_settings !== false ? 'checked' : ''}> Advanced Settings</label>
          <label class="pip-check"><input type="checkbox" id="editor-show-message" ${cfg.show_message !== false ? 'checked' : ''}> Message</label>
          <label class="pip-check"><input type="checkbox" id="editor-show-selected-tvs" ${cfg.show_selected_tvs !== false ? 'checked' : ''}> Selected TVs</label>
        </div>
        <div class="pip-row">
          <label class="lbl">Strip Words</label>
          <input type="text" id="editor-strip-strings" value="${cfg.strip_strings !== undefined ? cfg.strip_strings : 'PiPup'}" placeholder="PiPup">
          <span class="pip-hint">Comma-separated words removed from TV names</span>
        </div>
        <div class="pip-row">
          <label class="lbl">Show Entity IDs</label>
          <select id="editor-show-entity-ids">
            <option value="false" ${!cfg.show_entity_ids ? 'selected' : ''}>Hide</option>
            <option value="true" ${cfg.show_entity_ids ? 'selected' : ''}>Show</option>
          </select>
          <span class="pip-hint">Display entity IDs under each TV name</span>
        </div>
      </div>

      <div class="pip-sub">
        <div class="pip-row">
          <label class="lbl">Title</label>
          <input type="text" id="editor-card-title" value="${cfg.card_title || 'PiPup Notify'}" placeholder="PiPup Notify">
        </div>
        <div class="pip-row">
          <label class="lbl">Icon</label>
          <input type="text" id="editor-card-icon" value="${cfg.card_icon || 'mdi:bell-outline'}" placeholder="mdi:bell-outline">
        </div>
        <div class="pip-hint" style="margin:0 0 4px 112px;">Card Icon: use any MDI icon name like <code>mdi:bell-outline</code>, <code>mdi:television</code>, etc.</div>
        <div class="pip-row">
          <label class="pip-check"><input type="checkbox" id="editor-card-collapsible" ${cfg.card_collapsible ? 'checked' : ''}> Collapsible</label>
          <label class="pip-check"><input type="checkbox" id="editor-card-show-chevron" ${cfg.card_show_chevron !== false ? 'checked' : ''}> Show Chevron</label>
        </div>
        <div class="pip-row">
          <label class="pip-check"><input type="checkbox" id="editor-card-title-icon-as-chevron" ${cfg.card_title_icon_as_chevron ? 'checked' : ''}> Use title icon in place of Chevron</label>
        </div>
        <div class="pip-hint" style="margin:0 0 4px 112px;">The title icon rotates to indicate collapsed state (requires Collapsible).</div>
      </div>

      <div class="pip-sub">
        <div class="pip-sub-label">Background</div>
        <div class="pip-row">
          <label class="lbl">Mode</label>
          <select id="editor-card-bg-mode">
            <option value="theme" ${(cfg.card_bg_mode || 'theme') === 'theme' ? 'selected' : ''}>Theme default</option>
            <option value="transparent" ${cfg.card_bg_mode === 'transparent' ? 'selected' : ''}>Transparent</option>
            <option value="custom" ${cfg.card_bg_mode === 'custom' ? 'selected' : ''}>Custom color</option>
          </select>
        </div>
        <div class="pip-row" id="editor-card-bg-color-row" style="${(cfg.card_bg_mode || 'theme') === 'custom' ? '' : 'display:none;'}">
          <label class="lbl">Card Background</label>
          <input type="color" id="editor-card-bg-color" value="${cfg.card_bg_color || '#1c1c1c'}">
        </div>
      </div>

      <div class="pip-sub">
        <div class="pip-sub-label">Border</div>
        <label class="pip-check" style="padding:4px 0;"><input type="checkbox" id="editor-card-border-enabled" ${cfg.card_border_enabled ? 'checked' : ''}> Enable card border</label>
        <div class="pip-row">
          <label class="lbl">Border Color</label>
          <input type="color" id="editor-card-border-color" value="${cfg.card_border_color || '#2196F3'}">
        </div>
        <div class="pip-row">
          <label class="lbl">Border Width</label>
          <input type="range" id="editor-card-border-width" min="0" max="8" step="1" value="${cfg.card_border_width || 1}">
          <span class="pip-val" id="editor-card-border-width-value">${cfg.card_border_width || 1}px</span>
        </div>
        <div class="pip-row">
          <label class="lbl">Border Radius</label>
          <input type="range" id="editor-card-border-radius" min="0" max="24" step="1" value="${cfg.card_border_radius || 12}">
          <span class="pip-val" id="editor-card-border-radius-value">${cfg.card_border_radius || 12}px</span>
        </div>
        <div class="pip-row">
          <label class="pip-check"><input type="checkbox" class="ed-card-border-side" data-side="top" ${cfg.card_border_top !== false ? 'checked' : ''}> Top</label>
          <label class="pip-check"><input type="checkbox" class="ed-card-border-side" data-side="bottom" ${cfg.card_border_bottom !== false ? 'checked' : ''}> Bottom</label>
          <label class="pip-check"><input type="checkbox" class="ed-card-border-side" data-side="left" ${cfg.card_border_left !== false ? 'checked' : ''}> Left</label>
          <label class="pip-check"><input type="checkbox" class="ed-card-border-side" data-side="right" ${cfg.card_border_right !== false ? 'checked' : ''}> Right</label>
        </div>
      </div>

      <div class="pip-sub">
        <div class="pip-sub-label">Glow</div>
        <label class="pip-check" style="padding:4px 0;"><input type="checkbox" id="editor-card-glow-enabled" ${cfg.card_glow_enabled ? 'checked' : ''}> Enable card glow</label>
        <div class="pip-row">
          <label class="lbl">Glow Color</label>
          <input type="color" id="editor-card-glow-color" value="${cfg.card_glow_color || '#2196F3'}">
        </div>
        <div class="pip-row">
          <label class="lbl">Glow Intensity</label>
          <input type="range" id="editor-card-glow-intensity" min="0.25" max="3.0" step="0.05" value="${cfg.card_glow_intensity || 1.0}">
          <span class="pip-val" id="editor-card-glow-intensity-value">${Math.round((cfg.card_glow_intensity || 1.0) * 100)}%</span>
        </div>
        <label class="pip-check" style="padding:4px 0;"><input type="checkbox" id="editor-card-glow-borders-only" ${cfg.card_glow_borders_only !== false ? 'checked' : ''}> Glow stronger on sides with borders (when borders enabled)</label>
        <label class="pip-check" style="padding:4px 0;"><input type="checkbox" id="editor-card-glow-when-online" ${cfg.card_glow_when_online ? 'checked' : ''}> Glow when any TV is online</label>
        <div class="pip-row">
          <label class="lbl">Glow Entity</label>
          <input type="text" id="editor-card-glow-entity" value="${cfg.card_glow_entity || ''}" placeholder="Optional: entity to enable glow">
        </div>
        <div class="pip-hint" style="margin:0 0 4px 112px;">Glow Entity: enter an entity ID to make the card glow only when that entity is 'on'.</div>
      </div>

      <div class="pip-sub">
        <div class="pip-sub-label">Drop Shadow</div>
        <div class="pip-hint" style="margin-bottom:6px;">A plain elevation shadow, separate from the colored Glow effect above.</div>
        <label class="pip-check" style="padding:4px 0;"><input type="checkbox" id="editor-card-shadow-enabled" ${cfg.card_shadow_enabled ? 'checked' : ''}> Enable drop-shadow</label>
        <div class="pip-row">
          <label class="lbl">Shadow Color</label>
          <input type="color" id="editor-card-shadow-color" value="${cfg.card_shadow_color || '#000000'}">
        </div>
        <div class="pip-row">
          <label class="lbl">X Offset</label>
          <input type="range" id="editor-card-shadow-x" min="-20" max="20" step="1" value="${Number(cfg.card_shadow_x) || 0}">
          <span class="pip-val" id="editor-card-shadow-x-value">${Number(cfg.card_shadow_x) || 0}px</span>
        </div>
        <div class="pip-row">
          <label class="lbl">Y Offset</label>
          <input type="range" id="editor-card-shadow-y" min="-20" max="20" step="1" value="${Number(cfg.card_shadow_y) || 4}">
          <span class="pip-val" id="editor-card-shadow-y-value">${Number(cfg.card_shadow_y) || 4}px</span>
        </div>
        <div class="pip-row">
          <label class="lbl">Blur</label>
          <input type="range" id="editor-card-shadow-blur" min="0" max="40" step="1" value="${Number(cfg.card_shadow_blur) || 16}">
          <span class="pip-val" id="editor-card-shadow-blur-value">${Number(cfg.card_shadow_blur) || 16}px</span>
        </div>
        <div class="pip-row">
          <label class="lbl">Spread</label>
          <input type="range" id="editor-card-shadow-spread" min="-20" max="20" step="1" value="${Number(cfg.card_shadow_spread) || 0}">
          <span class="pip-val" id="editor-card-shadow-spread-value">${Number(cfg.card_shadow_spread) || 0}px</span>
        </div>
        <div class="pip-row">
          <label class="lbl">Opacity</label>
          <input type="range" id="editor-card-shadow-opacity" min="0" max="100" step="1" value="${Math.round((Number(cfg.card_shadow_opacity) ?? 0.35) * 100)}">
          <span class="pip-val" id="editor-card-shadow-opacity-value">${Math.round((Number(cfg.card_shadow_opacity) ?? 0.35) * 100)}%</span>
        </div>
      </div>

      <div class="pip-sub">
        <div class="pip-sub-label">Title Bar Style</div>
        <div class="pip-row">
          <label class="lbl">Text Color</label>
          <input type="color" id="editor-card-title-text-color" value="${cfg.card_title_text_color || '#e1e1e1'}">
        </div>
        <div class="pip-row">
          <label class="lbl">Icon Color Mode</label>
          <select id="editor-card-title-icon-color-mode">
            <option value="fixed" ${(cfg.card_title_icon_color_mode || 'fixed') === 'fixed' ? 'selected' : ''}>Fixed color</option>
            <option value="status" ${cfg.card_title_icon_color_mode === 'status' ? 'selected' : ''}>By TV status (on/off)</option>
          </select>
        </div>
        <div class="pip-row" id="editor-title-icon-fixed-row" style="${(cfg.card_title_icon_color_mode || 'fixed') === 'fixed' ? '' : 'display:none;'}">
          <label class="lbl">Icon Color</label>
          <input type="color" id="editor-card-title-icon-color" value="${cfg.card_title_icon_color || '#2196F3'}">
        </div>
        <div id="editor-title-icon-status-rows" style="${cfg.card_title_icon_color_mode === 'status' ? '' : 'display:none;'}">
          <div class="pip-row">
            <label class="lbl">When On</label>
            <select id="editor-card-title-icon-on-mode">
              <option value="theme" ${cfg.card_title_icon_on_mode === 'theme' ? 'selected' : ''}>Theme default</option>
              <option value="custom" ${(cfg.card_title_icon_on_mode || 'custom') === 'custom' ? 'selected' : ''}>Custom color</option>
            </select>
            <input type="color" id="editor-card-title-icon-on-color" value="${cfg.card_title_icon_on_color || '#4CAF50'}" style="${(cfg.card_title_icon_on_mode || 'custom') === 'custom' ? '' : 'display:none;'}">
          </div>
          <div class="pip-row">
            <label class="lbl">When Off</label>
            <select id="editor-card-title-icon-off-mode">
              <option value="theme" ${(cfg.card_title_icon_off_mode || 'theme') === 'theme' ? 'selected' : ''}>Theme default</option>
              <option value="custom" ${cfg.card_title_icon_off_mode === 'custom' ? 'selected' : ''}>Custom color</option>
            </select>
            <input type="color" id="editor-card-title-icon-off-color" value="${cfg.card_title_icon_off_color || '#808080'}" style="${cfg.card_title_icon_off_mode === 'custom' ? '' : 'display:none;'}">
          </div>
          <div class="pip-hint" style="margin:0 0 4px 112px;">Icon color reflects whether any TV is online.</div>
        </div>
        <div class="pip-row">
          <label class="lbl">Title Text Size</label>
          <input type="range" id="editor-card-title-font-size" min="10" max="40" step="1" value="${cfg.card_title_font_size || 16}">
          <span class="pip-val" id="editor-card-title-font-size-value">${cfg.card_title_font_size || 16}px</span>
        </div>
        <div class="pip-row">
          <label class="lbl">Title Font Weight</label>
          <select id="editor-card-title-font-weight">
            ${[
              { v: 300, l: 'Light (300)' },
              { v: 400, l: 'Normal (400)' },
              { v: 500, l: 'Medium (500)' },
              { v: 600, l: 'Semi-Bold (600)' },
              { v: 700, l: 'Bold (700)' },
              { v: 800, l: 'Extra-Bold (800)' },
              { v: 900, l: 'Black (900)' },
            ].map(o => `<option value="${o.v}" ${(Number(cfg.card_title_font_weight) || 700) === o.v ? 'selected' : ''}>${o.l}</option>`).join('')}
          </select>
        </div>
        <div class="pip-row">
          <label class="lbl">Icon Size</label>
          <input type="range" id="editor-card-title-icon-size" min="10" max="48" step="1" value="${cfg.card_title_icon_size || 22}">
          <span class="pip-val" id="editor-card-title-icon-size-value">${cfg.card_title_icon_size || 22}px</span>
        </div>
        <div class="pip-row">
          <label class="lbl">Title Indent</label>
          <input type="range" id="editor-card-title-indent" min="0" max="64" step="1" value="${Number(cfg.card_title_indent) || 0}">
          <span class="pip-val" id="editor-card-title-indent-value">${Number(cfg.card_title_indent) || 0}px</span>
        </div>
      </div>

    `;

    // --- Notification Settings body (now also holds the former "Visual Styling" rows) ---
    const notifSettingsBody = `
      <div class="pip-row">
        <label class="lbl">Title</label>
        <input type="text" id="editor-notification-title" value="${cfg.notification_title || 'Home Assistant'}">
      </div>
      <div class="pip-row">
        <label class="lbl">Title Emoji</label>
        <input type="text" id="editor-notification-title-emoji" value="${cfg.notification_title_emoji || ''}" placeholder="🔔" style="flex:0 0 auto;max-width:80px;">
        <span class="pip-hint">An emoji shown before the notification title</span>
      </div>
      <div class="pip-row">
        <label class="lbl">Message</label>
        <input type="text" id="editor-default-message" value="${cfg.default_message || ''}">
      </div>
      <div class="pip-row">
        <label class="lbl">Position</label>
        <select id="editor-default-position">
          ${POSITIONS_LIST.map(opt => `<option value="${opt.value}" ${cfg.default_position === opt.value ? 'selected' : ''}>${opt.label}</option>`).join('')}
        </select>
      </div>
      <div class="pip-row">
        <label class="lbl">Background Color</label>
        <input type="color" id="editor-default-color" value="${ccColorToHex(cfg.default_background_color || '#CC161616')}">
      </div>
      <div class="pip-row">
        <label class="lbl">Transparency</label>
        <input type="range" id="editor-default-transparency" min="0" max="5" step="1" value="${transIdx >= 0 ? transIdx : 4}">
        <span class="pip-val" id="editor-default-transparency-value">${TRANSPARENCY_OPTIONS[transIdx >= 0 ? transIdx : 4].label}</span>
      </div>
      <div class="pip-row">
        <label class="lbl">Title Color</label>
        <input type="color" id="editor-title-color" value="${cfg.title_color || '#FFFFFF'}">
      </div>
      <div class="pip-row">
        <label class="lbl">Corner Radius</label>
        <input type="range" id="editor-corner-radius" min="0" max="50" step="1" value="${cfg.corner_radius || 18}">
        <span class="pip-val" id="editor-corner-radius-value">${cfg.corner_radius || 18}px</span>
      </div>
      <div class="pip-row">
        <label class="lbl">Urgency</label>
        <select id="editor-default-urgency">
          ${URGENCY_OPTIONS.map(opt => `<option value="${opt.value}" ${(cfg.default_urgency || '') === opt.value ? 'selected' : ''}>${opt.label}</option>`).join('')}
        </select>
        <span class="pip-hint">Default colored border preset (also selectable on the Live Card)</span>
      </div>
    `;

    // --- Profiles rows ---
    const profileCreatorBody = `
      <div class="pip-row">
        <label class="lbl">Loaded:</label>
        <input type="text" id="editor-profile-name" placeholder="Profile name" value="${this._escapeHtml(cfg.active_profile || '')}">
        <button id="editor-save-profile" style="padding:6px 14px;background:#2196F3;color:white;border:none;border-radius:4px;cursor:pointer;font-size:13px;font-weight:500;">Save</button>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;padding:4px 0;" id="editor-profile-list">
        ${this._renderProfileChips(profiles)}
      </div>
      <div class="pip-hint" style="padding-top:4px;">Load by selecting a chip. Save a new profile by entering a new name and saving. Presets save all settings under Notification Profiles area.</div>
    `;

    // --- Target TVs rows ---
    const targetTvsBody = `
      <div id="editor-tv-list">${this._renderTvListInner()}</div>
    `;

    // --- Notification Buttons body ---
    const buttonsBody = `
      ${[1, 2, 3].map(n => `
        <div class="pip-row">
          <label class="pip-check" style="min-width:60px;"><input type="checkbox" id="editor-button${n}-enabled" ${cfg['button' + n + '_enabled'] ? 'checked' : ''}> #${n}</label>
          <input type="text" id="editor-button${n}-label" value="${this._escapeHtml(cfg['button' + n + '_label'] || '')}" placeholder="Label" style="min-width:80px;">
          <input type="text" id="editor-button${n}-id" value="${this._escapeHtml(cfg['button' + n + '_id'] || '')}" placeholder="ID" style="min-width:60px;">
        </div>
      `).join('')}
      <div class="pip-row">
        <label class="lbl">Button Color</label>
        <input type="color" id="editor-button-color" value="${cfg.button_color || '#1565C0'}">
      </div>
    `;

    // --- Behavior body (now also holds Display Time) ---
    const behaviorBody = `
      <div class="pip-row">
        <label class="lbl">Display Time</label>
        <input type="range" id="editor-default-duration" min="0" max="60" step="1" value="${cfg.default_duration || 10}">
        <span class="pip-val" id="editor-default-duration-value">${cfg.default_duration || 10}s</span>
      </div>
      <div class="pip-behavior-row">
        <label><ha-icon icon="mdi:progress-clock" style="--mdc-icon-size:18px;color:var(--secondary-text-color,#808080);"></ha-icon><input type="checkbox" id="editor-show-progress" ${cfg.show_progress !== false ? 'checked' : ''}> Show progress bar</label>
        <label><ha-icon icon="mdi:volume-high" style="--mdc-icon-size:18px;color:var(--secondary-text-color,#808080);"></ha-icon><input type="checkbox" id="editor-tts-enabled" ${cfg.tts_enabled ? 'checked' : ''}> Speak aloud (TTS)</label>
        <label><ha-icon icon="mdi:gesture-tap" style="--mdc-icon-size:18px;color:var(--secondary-text-color,#808080);"></ha-icon><input type="checkbox" id="editor-interrupt-enabled" ${cfg.interrupt_enabled !== false ? 'checked' : ''}> Dismissible</label>
      </div>
    `;

    // --- Media & Animation body ---
    const mediaBody = `
      <div class="pip-row">
        <label class="lbl">Media Width</label>
        <input type="range" id="editor-default-media-width" min="0" max="4000" step="10" value="${cfg.default_media_width || 480}">
        <span class="pip-val" id="editor-default-media-width-value">${cfg.default_media_width || 480}px</span>
      </div>
      <div class="pip-row">
        <label class="lbl">Media Position</label>
        <select id="editor-default-media-position">
          ${MEDIA_POSITIONS.map(opt => `<option value="${opt.value}" ${cfg.default_media_position === opt.value ? 'selected' : ''}>${opt.label}</option>`).join('')}
        </select>
      </div>
      <div class="pip-row">
        <label class="lbl">Title Alignment</label>
        <select id="editor-default-title-alignment">
          ${TITLE_ALIGNMENTS.map(opt => `<option value="${opt.value}" ${cfg.default_title_alignment === opt.value ? 'selected' : ''}>${opt.label}</option>`).join('')}
        </select>
      </div>
      <div class="pip-row">
        <label class="lbl">Animation</label>
        <select id="editor-default-animation-type">
          ${ANIMATION_TYPES.map(opt => `<option value="${opt.value}" ${cfg.default_animation_type === opt.value ? 'selected' : ''}>${opt.label}</option>`).join('')}
        </select>
      </div>
      <div class="pip-row">
        <label class="lbl">Anim. Duration</label>
        <input type="range" id="editor-default-animation-duration" min="0" max="5000" step="50" value="${cfg.default_animation_duration !== undefined ? cfg.default_animation_duration : 250}">
        <span class="pip-val" id="editor-default-animation-duration-value">${cfg.default_animation_duration !== undefined ? cfg.default_animation_duration : 250}ms</span>
      </div>
    `;

    // --- Jinja body ---
    const jinjaBody = `
      <div style="background:var(--secondary-background-color, #1a1a1a);padding:10px;border-radius:4px;border:1px solid #333;font-family:monospace;font-size:12px;color:#cde6ff;line-height:1.6;overflow-x:auto;white-space:pre-wrap;word-break:break-all;">
        <code>{% set net = states('sensor.grid_power') | int(0) %} ☀️ Solar: {{ states('sensor.pv_power') | int(0) }} W 🏠 House: {{ states('sensor.house_power') | int(0) }} W 🔌 Grid: {{ net | abs }} W {{ 'import' if net > 0 else 'export' }} 🚗 Battery: {{ states('sensor.car_battery') | int(0) }}%</code>
      </div>
      <div style="font-size:11px;color:var(--secondary-text-color, #808080);padding-top:4px;">
        Use Jinja to pull live sensor data into your notifications
      </div>
    `;

    // --- Admin body ---
    const adminBody = `
      <label class="pip-check" style="padding:4px 0;"><input type="checkbox" id="editor-debug" ${cfg.debug ? 'checked' : ''}> Enable debug logging</label>
      <label class="pip-check" style="padding:4px 0;"><input type="checkbox" id="editor-show-version" ${cfg.show_version ? 'checked' : ''}> Show version number on card</label>
      <div class="pip-row">
        <label class="lbl">Auth Token</label>
        <input type="password" id="editor-token" value="${cfg.token || ''}" placeholder="Optional">
      </div>
      <div style="padding:2px 0 4px 112px;display:flex;align-items:center;gap:6px;">
        <ha-icon icon="${hasToken ? 'mdi:lock' : 'mdi:lock-open-variant-outline'}" style="--mdc-icon-size:16px;color:${hasToken ? '#4CAF50' : 'var(--secondary-text-color, #808080)'};"></ha-icon>
        <span style="font-size:12px;font-weight:500;color:${hasToken ? '#4CAF50' : 'var(--secondary-text-color, #808080)'};">
          ${hasToken ? 'Configured' : 'Not configured'}
        </span>
      </div>
    `;

    // Helper for a labelled sub-section inside a combined section.
    const sub = (label, desc, body, first) => `
      <div class="pip-sub"${first ? ' style="border-top:none;padding-top:0;margin-top:0;"' : ''}>
        ${label ? `<div class="pip-sub-label">${label}</div>` : ''}
        ${desc ? `<div style="font-size:11px;color:var(--secondary-text-color, #808080);margin-bottom:6px;">${desc}</div>` : ''}
        ${body}
      </div>
    `;

    // --- Combined "Notification Profile Creator" body ---
    // Profile Creator + Target TVs sit at the top, followed by every other
    // notification-related area as sub-sections.
    const profileCreatorSection = `
      ${sub('', 'Default profile can be edited but not deleted', profileCreatorBody, true)}
      ${sub('Target TVs (for this profile)', 'Checking a TV here only affects the profile you save above — it does not change the Live Card.', targetTvsBody)}
      ${sub('', '', notifSettingsBody)}
      ${sub('Action Buttons', '', buttonsBody)}
      ${sub('Behavior', '', behaviorBody)}
      ${sub('Media & Animation', 'Applied whenever an Image URL or Video URL is sent', mediaBody)}
      ${sub('Jinja Template Support', 'The Message field supports Jinja templates for dynamic content', jinjaBody)}
    `;

    this.innerHTML = `
      ${styleBlock}
      <div class="pipup-editor">
        <div style="font-size:16px;font-weight:500;color:var(--primary-text-color);">
          PiPup Notify Card Editor — ${BUILD_NUMBER}
        </div>

        ${this._section('mdi:palette', 'Card Settings', 'editor-card-visuals-body', cardVisualsBody, { desc: 'Appearance of the PiPup card itself' })}
        ${this._section('mdi:folder-star-outline', 'Notification Profiles', 'editor-notification-visuals-body', profileCreatorSection, { desc: 'Build a notification profile: pick TVs, style it, and save it as a preset' })}
        ${this._section('mdi:shield-key', 'Admin Settings', 'editor-admin-body', adminBody, { desc: 'These settings are not saved with profiles', border: '#f44336', color: '#f44336' })}

        <div style="border-top:1px solid #333;padding-top:12px;margin-top:4px;">
          <div style="font-weight:500;margin-bottom:8px;color:var(--primary-text-color);">Current Configuration</div>
          <pre style="font-size:13px;color:var(--secondary-text-color, #808080);font-family:monospace;background:var(--secondary-background-color, #1a1a1a);padding:12px;border-radius:4px;white-space:pre-wrap;word-break:break-all;margin:0;border:1px solid #333;">${JSON.stringify(cfg, null, 2)}</pre>
        </div>
      </div>
    `;

    this.attachEditorListeners();
  }

  attachEditorListeners() {
    // Collapsible sections — accordion: opening one collapses the others.
    this.querySelectorAll('.pip-sec-header').forEach(header => {
      header.addEventListener('click', () => {
        const sec = header.closest('.pip-sec');
        if (!sec) return;
        const willOpen = sec.classList.contains('collapsed');
        this.querySelectorAll('.pip-sec').forEach(s => s.classList.add('collapsed'));
        if (willOpen) sec.classList.remove('collapsed');
        // Remember which section is open so a re-render keeps it open.
        this._openSection = willOpen ? header.dataset.target : null;
      });
    });

    // Device checkboxes (req 6 — sync local config immediately)
    this._attachDeviceCheckboxListeners();

    // Show Entity IDs select (req 2 — was never wired)
    const showIdsEl = this.querySelector('#editor-show-entity-ids');
    if (showIdsEl) {
      showIdsEl.addEventListener('change', () => {
        this._config = { ...this._config, show_entity_ids: showIdsEl.value === 'true' };
        // Reflect the change in the editor's own TV list too.
        this._lastTvKey = null;
        this._updateTvList();
        this._fire(this._config);
      });
    }

    // Profile chip clicks (load / delete)
    this._attachProfileChipListeners();

    // Save profile
    const saveBtn = this.querySelector('#editor-save-profile');
    const profileNameInput = this.querySelector('#editor-profile-name');
    if (saveBtn && profileNameInput) {
      saveBtn.addEventListener('click', () => {
        const name = profileNameInput.value.trim();
        if (!name) {
          alert('Please enter a profile name');
          return;
        }
        const config = { ...this._config };
        const fields = [
          'token', 'strip_strings', 'card_title', 'card_icon',
          'notification_title', 'notification_title_emoji', 'default_message',
          'default_duration', 'default_position', 'default_background_color',
          'default_transparency', 'border_color', 'title_color', 'corner_radius',
          'border_width', 'button1_label', 'button1_id', 'button2_label',
          'button2_id', 'button3_label', 'button3_id', 'button_color',
          'default_media_width', 'default_media_position', 'default_title_alignment',
          'default_animation_type', 'default_animation_duration', 'default_urgency',
          'card_border_color', 'card_border_width', 'card_border_radius',
          'card_glow_color', 'card_glow_intensity', 'card_title_text_color',
          'card_title_icon_color', 'card_title_font_size', 'card_title_font_weight',
          'card_title_icon_size', 'card_title_indent',
          'card_bg_color', 'card_glow_entity', 'show_entity_ids'
        ];

        // Resolve transparency FIRST (the slider stores a 0–5 index; the stored
        // value must be the 2-hex-digit alpha string like "CC"). Doing this up
        // front means the background-color conversion gets a valid alpha string.
        const transEl = this.querySelector('#editor-default-transparency');
        if (transEl) {
          const idx = parseInt(transEl.value) || 0;
          config.default_transparency = (TRANSPARENCY_OPTIONS[idx] || TRANSPARENCY_OPTIONS[4]).value;
        }

        fields.forEach(key => {
          if (key === 'default_transparency') return; // handled above
          const id = `editor-${key.replace(/_/g, '-')}`;
          const el = this.querySelector(`#${id}`);
          if (el) {
            if (el.type === 'checkbox') {
              config[key] = el.checked;
            } else if (el.type === 'number' || el.type === 'range') {
              config[key] = parseInt(el.value) || 0;
            } else if (el.type === 'select-one') {
              if (key === 'show_entity_ids') {
                config[key] = el.value === 'true';
              } else if (['default_position', 'default_media_position', 'default_title_alignment'].includes(key)) {
                config[key] = parseInt(el.value) || 0;
              } else {
                config[key] = el.value;
              }
            } else if (el.type === 'color') {
              if (key === 'default_background_color') {
                config[key] = hexToCcColor(el.value, config.default_transparency);
              } else {
                config[key] = el.value;
              }
            } else {
              config[key] = el.value;
            }
          }
        });

        // The background color input has a distinct id; capture it explicitly.
        const bgEl = this.querySelector('#editor-default-color');
        if (bgEl) config.default_background_color = hexToCcColor(bgEl.value, config.default_transparency);

        ['show_progress', 'tts_enabled', 'interrupt_enabled', 'debug', 'show_version',
         'card_collapsible', 'card_show_chevron', 'card_title_icon_as_chevron',
         'card_border_enabled', 'card_glow_enabled', 'card_glow_borders_only',
         'card_glow_when_online', 'card_shadow_enabled',
         'show_advanced_settings', 'show_message', 'show_selected_tvs'].forEach(key => {
          const el = this.querySelector(`#editor-${key.replace(/_/g, '-')}`);
          if (el) config[key] = el.checked;
        });

        // Values kept current in this._config via _fire() — copy straight through
        // (drop-shadow opacity stays a 0-1 fraction; the mode/color selects too).
        ['card_shadow_color', 'card_shadow_x', 'card_shadow_y', 'card_shadow_blur',
         'card_shadow_spread', 'card_shadow_opacity',
         'card_bg_mode', 'card_title_icon_color_mode',
         'card_title_icon_on_mode', 'card_title_icon_on_color',
         'card_title_icon_off_mode', 'card_title_icon_off_color'].forEach(key => {
          if (this._config[key] !== undefined) config[key] = this._config[key];
        });

        ['button1_enabled', 'button2_enabled', 'button3_enabled'].forEach(key => {
          const el = this.querySelector(`#editor-${key.replace(/_/g, '-')}`);
          if (el) config[key] = el.checked;
        });

        ['top', 'bottom', 'left', 'right'].forEach(side => {
          const el = this.querySelector(`.ed-card-border-side[data-side="${side}"]`);
          if (el) config[`card_border_${side}`] = el.checked;
        });

        // The profile's TVs come from the Profile Creator's local selection, not
        // the Live Card's selected_devices (req 3).
        config.selected_devices = [...this.querySelectorAll('#editor-tv-list .device-checkbox:checked')]
          .map(el => el.value);

        try {
          let profiles = loadProfilesWithDefault();
          const profile = { name: name, config: config };
          const existing = profiles.findIndex(p => p.name === name);
          if (existing >= 0) {
            profiles[existing] = profile;
          } else {
            profiles.push(profile);
          }
          localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profiles));
          // Persist the whole config (including selected_devices for this profile)
          // to the card's YAML config so the saved settings survive a reload and
          // are visible in the card configuration.
          this._config = { ...config, active_profile: name };
          this._fire(this._config);
          // Update ONLY the chip list in place — do not rebuild the whole editor
          // (that would collapse sections and reset scroll/focus).
          this._refreshProfileChips();
          // Keep the "Loaded:" field showing the just-saved profile name.
          if (profileNameInput) profileNameInput.value = name;
        } catch (e) {
          alert('Failed to save profile: ' + e.message);
        }
      });
      profileNameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          saveBtn.click();
        }
      });
    }

    // Text/select/color fields
    const fields = [
      { id: 'editor-token', key: 'token' },
      { id: 'editor-strip-strings', key: 'strip_strings' },
      { id: 'editor-card-title', key: 'card_title' },
      { id: 'editor-card-icon', key: 'card_icon' },
      { id: 'editor-notification-title', key: 'notification_title' },
      { id: 'editor-notification-title-emoji', key: 'notification_title_emoji' },
      { id: 'editor-default-message', key: 'default_message' },
      { id: 'editor-default-position', key: 'default_position', numeric: true },
      { id: 'editor-default-color', key: 'default_background_color', bg: true },
      { id: 'editor-title-color', key: 'title_color' },
      { id: 'editor-default-urgency', key: 'default_urgency' },
      { id: 'editor-button1-label', key: 'button1_label' },
      { id: 'editor-button1-id', key: 'button1_id' },
      { id: 'editor-button2-label', key: 'button2_label' },
      { id: 'editor-button2-id', key: 'button2_id' },
      { id: 'editor-button3-label', key: 'button3_label' },
      { id: 'editor-button3-id', key: 'button3_id' },
      { id: 'editor-button-color', key: 'button_color' },
      { id: 'editor-default-media-position', key: 'default_media_position', numeric: true },
      { id: 'editor-default-title-alignment', key: 'default_title_alignment', numeric: true },
      { id: 'editor-default-animation-type', key: 'default_animation_type' },
      { id: 'editor-card-border-color', key: 'card_border_color' },
      { id: 'editor-card-glow-color', key: 'card_glow_color' },
      { id: 'editor-card-shadow-color', key: 'card_shadow_color' },
      { id: 'editor-card-title-font-weight', key: 'card_title_font_weight', numeric: true },
      { id: 'editor-card-title-text-color', key: 'card_title_text_color' },
      { id: 'editor-card-title-icon-color', key: 'card_title_icon_color' },
      { id: 'editor-card-title-icon-on-color', key: 'card_title_icon_on_color' },
      { id: 'editor-card-title-icon-off-color', key: 'card_title_icon_off_color' },
      { id: 'editor-card-glow-entity', key: 'card_glow_entity' },
    ];

    fields.forEach(({ id, key, numeric, bg }) => {
      const el = this.querySelector(`#${id}`);
      if (!el) return;
      const eventType = 'change';
      el.addEventListener(eventType, () => {
        let val;
        if (bg) {
          val = hexToCcColor(el.value, this._config.default_transparency);
        } else {
          val = numeric ? parseInt(el.value) || 0 : el.value;
        }
        this._fire({ ...this._config, [key]: val });
      });
    });

    // Selects that both store a value AND toggle related rows' visibility in place
    // (so the change doesn't require a full re-render that would steal focus).
    const bgModeEl = this.querySelector('#editor-card-bg-mode');
    if (bgModeEl) {
      bgModeEl.addEventListener('change', () => {
        const row = this.querySelector('#editor-card-bg-color-row');
        if (row) row.style.display = bgModeEl.value === 'custom' ? '' : 'none';
        this._fire({ ...this._config, card_bg_mode: bgModeEl.value });
      });
    }

    const iconModeEl = this.querySelector('#editor-card-title-icon-color-mode');
    if (iconModeEl) {
      iconModeEl.addEventListener('change', () => {
        const fixedRow = this.querySelector('#editor-title-icon-fixed-row');
        const statusRows = this.querySelector('#editor-title-icon-status-rows');
        if (fixedRow) fixedRow.style.display = iconModeEl.value === 'fixed' ? '' : 'none';
        if (statusRows) statusRows.style.display = iconModeEl.value === 'status' ? '' : 'none';
        this._fire({ ...this._config, card_title_icon_color_mode: iconModeEl.value });
      });
    }

    // On/Off status color mode selects, each toggling its own color swatch.
    [
      { sel: '#editor-card-title-icon-on-mode', key: 'card_title_icon_on_mode', swatch: '#editor-card-title-icon-on-color' },
      { sel: '#editor-card-title-icon-off-mode', key: 'card_title_icon_off_mode', swatch: '#editor-card-title-icon-off-color' },
    ].forEach(({ sel, key, swatch }) => {
      const el = this.querySelector(sel);
      if (!el) return;
      el.addEventListener('change', () => {
        const sw = this.querySelector(swatch);
        if (sw) sw.style.display = el.value === 'custom' ? '' : 'none';
        this._fire({ ...this._config, [key]: el.value });
      });
    });

    // Range sliders
    const rangeFields = [
      { id: 'editor-default-duration', key: 'default_duration' },
      { id: 'editor-default-transparency', key: 'default_transparency' },
      { id: 'editor-corner-radius', key: 'corner_radius' },
      { id: 'editor-card-border-width', key: 'card_border_width' },
      { id: 'editor-card-border-radius', key: 'card_border_radius' },
      { id: 'editor-card-glow-intensity', key: 'card_glow_intensity' },
      { id: 'editor-card-title-font-size', key: 'card_title_font_size' },
      { id: 'editor-card-title-icon-size', key: 'card_title_icon_size' },
      { id: 'editor-card-title-indent', key: 'card_title_indent' },
      { id: 'editor-default-media-width', key: 'default_media_width' },
      { id: 'editor-default-animation-duration', key: 'default_animation_duration' },
    ];

    rangeFields.forEach(({ id, key }) => {
      const el = this.querySelector(`#${id}`);
      if (!el) return;
      el.addEventListener('input', () => {
        let newVal;
        const label = this.querySelector(`#${id}-value`);
        if (key === 'default_transparency') {
          const idx = parseInt(el.value) || 0;
          const opt = TRANSPARENCY_OPTIONS[idx] || TRANSPARENCY_OPTIONS[4];
          newVal = opt.value;
          if (label) label.textContent = opt.label;
        } else if (key === 'card_glow_intensity') {
          newVal = parseFloat(el.value);
          if (label) label.textContent = `${Math.round(newVal * 100)}%`;
        } else {
          newVal = parseInt(el.value) || 0;
          const suffix = key.includes('duration') ? 'ms' : (key.includes('width') || key.includes('radius') || key.includes('size') || key.includes('indent')) ? 'px' : (key === 'default_duration' ? 's' : '');
          if (label) label.textContent = `${newVal}${suffix}`;
        }
        this._fire({ ...this._config, [key]: newVal });
      });
    });

    // Card border side toggles
    this.querySelectorAll('.ed-card-border-side').forEach(el => {
      el.addEventListener('change', () => {
        this._fire({ ...this._config, [`card_border_${el.dataset.side}`]: el.checked });
      });
    });

    // Drop-shadow sliders (px offsets/blur/spread, and a 0-100% opacity stored as 0-1).
    [
      { id: 'editor-card-shadow-x', key: 'card_shadow_x', suffix: 'px' },
      { id: 'editor-card-shadow-y', key: 'card_shadow_y', suffix: 'px' },
      { id: 'editor-card-shadow-blur', key: 'card_shadow_blur', suffix: 'px' },
      { id: 'editor-card-shadow-spread', key: 'card_shadow_spread', suffix: 'px' },
      { id: 'editor-card-shadow-opacity', key: 'card_shadow_opacity', suffix: '%', pct: true },
    ].forEach(({ id, key, suffix, pct }) => {
      const el = this.querySelector(`#${id}`);
      if (!el) return;
      el.addEventListener('input', () => {
        const raw = parseInt(el.value) || 0;
        const label = this.querySelector(`#${id}-value`);
        if (label) label.textContent = `${raw}${suffix}`;
        // Opacity is stored as a 0-1 fraction; offsets/blur/spread stored as-is.
        this._fire({ ...this._config, [key]: pct ? raw / 100 : raw });
      });
    });

    // Card background custom color (only shown when Background Mode is 'custom').
    const cardBgColorEl = this.querySelector('#editor-card-bg-color');
    if (cardBgColorEl) {
      cardBgColorEl.addEventListener('input', () => {
        this._fire({ ...this._config, card_bg_mode: 'custom', card_bg_color: cardBgColorEl.value });
      });
    }

    // Button enabled checkboxes
    ['button1_enabled', 'button2_enabled', 'button3_enabled'].forEach(key => {
      const el = this.querySelector(`#editor-${key.replace(/_/g, '-')}`);
      if (!el) return;
      el.addEventListener('change', () => {
        this._fire({ ...this._config, [key]: el.checked });
      });
    });

    // Plain checkboxes
    const checkboxes = [
      { id: 'editor-show-progress', key: 'show_progress' },
      { id: 'editor-tts-enabled', key: 'tts_enabled' },
      { id: 'editor-interrupt-enabled', key: 'interrupt_enabled' },
      { id: 'editor-debug', key: 'debug' },
      { id: 'editor-show-version', key: 'show_version' },
      { id: 'editor-card-collapsible', key: 'card_collapsible' },
      { id: 'editor-card-show-chevron', key: 'card_show_chevron' },
      { id: 'editor-card-title-icon-as-chevron', key: 'card_title_icon_as_chevron' },
      { id: 'editor-card-border-enabled', key: 'card_border_enabled' },
      { id: 'editor-card-glow-enabled', key: 'card_glow_enabled' },
      { id: 'editor-card-glow-borders-only', key: 'card_glow_borders_only' },
      { id: 'editor-card-glow-when-online', key: 'card_glow_when_online' },
      { id: 'editor-card-shadow-enabled', key: 'card_shadow_enabled' },
      { id: 'editor-show-advanced-settings', key: 'show_advanced_settings' },
      { id: 'editor-show-message', key: 'show_message' },
      { id: 'editor-show-selected-tvs', key: 'show_selected_tvs' },
    ];

    checkboxes.forEach(({ id, key }) => {
      const el = this.querySelector(`#${id}`);
      if (!el) return;
      el.addEventListener('change', () => {
        if (key === 'debug') DEBUG = el.checked;
        this._fire({ ...this._config, [key]: el.checked });
      });
    });
  }

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
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
