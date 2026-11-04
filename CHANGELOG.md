# Changelog

## v2026.11.04.61

- **One Update control per TV:** the redundant large button is gone — the small **Update** pill in the app-version line is now the action.
- **Single Power toggle** per TV, replacing the separate Power On / Power Off buttons. It shows the current state (green when on) and flips it on click; an unknown state defaults to turning on. The header Power chip still shows the state.
- **Expanded Target-TV rows** are outlined in the theme's accent color, matching the editor's settings panels.

## v2026.11.04.59

- **Listed as "PiPup Notify Card (Ltek)"** in HACS and in Home Assistant's *Add card* picker, so searching "Ltek" finds it. The card type is unchanged, so existing dashboards are not affected.
- The repository can be added to HACS as a custom repository (category **Dashboard**).

## v2026.11.04.58

- **Per-TV app version and update:** each expanded Target-TV row shows the installed PiPup app version and, when a newer release exists, the available one with an optional **Update** button (app ≥ 0.6.0).
- **Full 3×3 position grid**, including center-left / center-right (app ≥ 0.26.0).
- **Stacking:** line up several popups vertically or horizontally (app ≥ 0.27.0).
- **Full-screen** popups (app ≥ 0.29.1).

Earlier builds (v2026.08.19.54, v2026.08.22.55) are in the git history and tags.
