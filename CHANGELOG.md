# Changelog

## v2026.11.26.62

- **Theme card style.** Card Style → **Theme card (your HA theme)** gives the card your theme's
  border, corners and shadow, like HA's own cards (the background already followed the theme). The
  Glow is **added** on top, so the card keeps the theme look and also glows while a TV is online or
  your glow entity is on. Turning on this card's own Border or Drop Shadow replaces the theme's.
  - New cards start with it (`card_style: theme`). Existing cards keep their current look until you
    pick it.
- **Fixed: several PiPup cards on one page shared each other's look.** The card's style rules
  weren't scoped, so the last card drawn set the border, glow and collapse state of all of them.
  Each card now keeps its own.
- The *Glow stronger on sides with borders* option is renamed **Glow only on the bordered sides**,
  which is what it does.

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
