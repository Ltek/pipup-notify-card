# PiPup Notify Card

A Home Assistant dashboard **custom card** for composing and sending rich [PiPup](https://github.com/mhoogenbosch/ha-pipup) notifications to Android TV and Fire TV — with reusable notification profiles, a full visual editor, and per-TV power control.

---

## Requirements

This card drives the **PiPup fork by [@mhoogenbosch](https://github.com/mhoogenbosch)**. You need both pieces:

1. **Home Assistant PiPup integration** — provides the `pipup.show` action and the per-device `notify` / `binary_sensor` / `switch` entities this card uses.
   - Repo: **https://github.com/mhoogenbosch/ha-pipup**
   - Install via **HACS → Integrations → Custom repositories** → add that repo as an *Integration* → install **PiPup** → restart Home Assistant.
   - (Manual: copy `custom_components/pipup` into your `custom_components/` folder and restart.)

2. **PiPup Android TV / Fire TV app (APK)** — installed on each TV.
   - Releases: **https://github.com/mhoogenbosch/PiPup/releases**
   - This fork is required — the Play Store build lacks the `/state` endpoint and indefinite popups.
   - Some features gate on app version:

     | App version | Unlocks |
     |-------------|---------|
     | ≥ 0.3.0 | Buttons, progress bar, urgency border presets |
     | ≥ 0.7.0 | Screen switch (TV power on/off), border styling |

---

## Installation

1. Copy `pipup-notify-card.js` into your Home Assistant `config/www/` folder.
2. Add it as a dashboard resource:
   - **Settings → Dashboards → ⋮ → Resources → Add Resource**
   - URL: `/local/pipup-notify-card.js`  ·  Type: **JavaScript Module**
3. Hard-refresh the browser (Ctrl/Cmd+Shift+R). Confirm the console shows the loaded version, e.g. `[v2026.08.19.54]`.
4. Add the card to a dashboard: **Add Card → Custom: PiPup Notify Card** (or `type: custom:pipup-notify-card`).

---

## Features

### Live Card (send + control)
- **Compose & send** a PiPup notification to one or more selected TVs.
- **Target TVs** list — each device is a collapsible row showing:
  - a checkbox to include it as a send target,
  - a **Power** chip (green On / yellow Off / grey Unknown),
  - a connectivity **Online/Offline** chip (red = offline/problem),
  - an expander that reveals per-device **Power On / Power Off** buttons and power automation options.
- **Advanced Settings** (collapsible) — Notification Title, Message, Display Time, Position, Urgency, background Color + Transparency, Title Color, Show progress / Speak aloud (TTS) / Dismissible, Action Buttons, Image/Video URL, Media Width.
- **Profiles** dropdown to instantly load a saved preset.
- **Jinja templates** supported in the Message field for live sensor data.

### Per-TV power control
- Turn each TV **on/off** individually from the card.
- **Power source per device** is configurable (in the editor): the built-in **PiPup Screen switch (auto)**, or an alternative `switch` / `remote` / `media_player` entity — e.g. the native **Android TV** (`media_player`/`remote`) or **Google Cast** (`media_player`) integrations. Domain filter checkboxes narrow the picker.
- **Turn On if Off** — when sending, automatically wake a TV that's currently off.
- **Turn Off After Send** — automatically power a TV off after the notification, with a per-TV **Off Delay** slider (extra seconds added after the notification duration).

### Notifications
- Title (+ optional emoji), message, display time, screen **position**.
- **Urgency** presets (Info / Warning / Critical) for colored borders.
- Background color + **transparency** (0% solid → 100% invisible).
- Title color, show-progress bar, **TTS** ("speak aloud"), dismissible.
- Up to **3 action buttons** — each fires a `pipup_button` event for automations.
- **Image / Video / media** URL with adjustable media width.

### Profiles
- Save the full set of notification + target settings as a named **profile**.
- A built-in **Default** profile that can be edited but not deleted.
- Profiles are stored in the card config (shared dashboard YAML) **and** browser localStorage, so they sync across devices (PC ↔ mobile) once saved.

### Card appearance (Visual Editor → Card Settings)
- Section visibility toggles (show/hide Advanced Settings, Message, Selected TVs).
- Title text, MDI icon, indent, font size, **font weight**, colors.
- Collapsible card; optional "use title icon in place of chevron"; expander rotates only when expanded.
- Title icon color: fixed, or **by TV status** (on/off colors driven by whether any TV is online).
- Card background: theme default / transparent / custom color.
- Border (per-side), **glow** (with "glow when any TV is online" and border-only options), and a plain **drop shadow** (color, offset, blur, spread, opacity).

### Editor niceties
- Fully collapsible, accordion-style settings panels (one open at a time), default collapsed.
- Color swatches carry a faint outline so dark colors stay visible on dark cards.
- Optional version-number display on the card (Admin Settings).

---

## Notes & limitations

- **`pipup.show` targets each TV's `binary_sensor.pipup_*_popup` entity**, which the card resolves automatically from the selected `notify.*` entity.
- **Turning a TV off** via the PiPup Screen switch may require a one-time ADB grant per TV (see the integration docs).
- **"Turn Off After Send"** is scheduled client-side (`setTimeout`) — it only fires while the dashboard/card stays loaded in the browser. For guaranteed off-timing, use a Home Assistant automation instead.
- Fields not supported by the current integration schema (e.g. corner radius, animation, per-button color) are hidden in the editor but retained in the code for when/if the integration adds them.

---

## Version

Build number format: `v<year>.<month>.<day>.<increment>` — the trailing increment is a monotonic version counter that never resets. It's defined once at the top of `pipup-notify-card.js` (`BUILD_NUMBER`) and shown in the editor header and browser console on load.

## Credits

- Card: **LTek** — [github.com/Ltek/pipup-notify-card](https://github.com/Ltek/pipup-notify-card)
- PiPup integration & Android app (fork): **[@mhoogenbosch](https://github.com/mhoogenbosch)** — [ha-pipup](https://github.com/mhoogenbosch/ha-pipup) · [PiPup APK](https://github.com/mhoogenbosch/PiPup/releases)
- Original PiPup app: rundfunk / PiPup project.

<img width="400" alt="image" src="https://github.com/user-attachments/assets/bec1e5ee-5546-47de-a466-58bdf9f19573" />
