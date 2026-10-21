# Music tracks (drop-in)

NEON RAIN plays one track per place, crossfading over 2 s when the place changes:

| Track id | When |
|---|---|
| `menu_theme` | title screen, setting cards, while a level loads |
| `tokyo_theme` | Tokyo Night (story and survival) |
| `desert_theme` | Desert Outpost (survival and TDM) |
| `docks_theme` | Neon Docks (TDM) |
| `jungle_theme` | Deep Jungle (survival and TDM) |

**To use your own music:** put a file named after the track id in this folder, for example `docks_theme.mp3`. That's all; reload the page. Supported names: `<id>.mp3`, `<id>.ogg`, `<id>.m4a`, `<id>.wav` (first one found wins).

- The file is looped from start to end, so make it loop seamlessly (no silence at either end).
- It's streamed (not decoded into memory), so long tracks are fine.
- Tracks without a file keep their procedural placeholder (the game's own synthesised music, which also follows the fight's intensity; a file plays as it is).

**Other names or levels:** add `manifest.json` here:

```json
{
  "docks_theme": { "file": "Harbour Night v3.mp3", "gain": 0.8 },
  "menu_theme": { "file": "title.ogg" }
}
```

`gain` (0..1, default 1) evens out loudness between tracks. A manifest entry replaces the naming convention for that track.

**Check what's playing:** in `npm run dev`, `__game.debug().music` lists the current track, its source (file or procedural) and which files were found.
