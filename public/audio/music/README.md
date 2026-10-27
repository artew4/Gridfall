# Music tracks (drop-in)

Gridfall plays one track per place, crossfading over 2 s when the place changes:

| Track id | When |
|---|---|
| `menu_theme` | title screen, setting cards, while a level loads |
| `tokyo_theme` | Tokyo Night (story and survival) |
| `desert_theme` | Desert Outpost (survival and TDM) |
| `docks_theme` | Neon Docks (TDM) |
| `jungle_theme` | Deep Jungle (survival and TDM) |
| `favela_theme` | Favelas |
| `maglev_theme` | Maglev Terminal |
| `oldport_theme` | Old Port |

**To use your own music:** put a file named after the track id in this folder, for example `docks_theme.mp3`. That's all; reload the page. Supported names: `<id>.mp3`, `<id>.ogg`, `<id>.m4a`, `<id>.wav` (first one found wins).

- The file is looped from start to end, so make it loop seamlessly (no silence at either end).
- It's streamed (not decoded into memory), so long tracks are fine.
- Tracks without a file keep their procedural placeholder (the game's own synthesised music, which also follows the fight's intensity; a file plays as it is).

**On the live site (GitHub Pages):** commit the file and push to `main`. The build records which files are in this folder and plays only those. A file added after the build isn't seen until the next deploy, and a folder with no music makes no requests at all. Keep files reasonably small (an .mp3 at 128–192 kbps): GitHub Pages serves the whole site, music included, from the repository.

**Other names or levels:** add `manifest.json` here:

```json
{
  "docks_theme": { "file": "Harbour Night v3.mp3", "gain": 0.8 },
  "menu_theme": { "file": "title.ogg" }
}
```

`gain` (0..1, default 1) evens out loudness between tracks. A manifest entry replaces the naming convention for that track.

**Check what's playing:** in `npm run dev`, `__game.debug().music` lists the current track, its source (file or procedural) and which files were found.

A file that fades out or has silence at its ends can loop seamlessly with a loop window in
`manifest.json` (60.0): `{ "desert_theme": { "file": "desert_theme.mp3", "loopStart": 0.18, "loopEnd": 157.746, "xfade": 1 } }`:
it plays from the start, and from `loopEnd − xfade` the next pass (from `loopStart`) crossfades in.

**Several tracks for one place** (87.0): give the track a list in `manifest.json`. Each time the place starts, one of them plays at random; at its end (or its `loopEnd`) another one at random crossfades in, never the same one twice running:

```json
"tokyo_theme": [
  { "file": "tokyo_theme.mp3", "loopStart": 0.1, "loopEnd": 166.0, "xfade": 1.5 },
  { "file": "black_rain_and_bamboo.mp3", "loopStart": 0.09, "loopEnd": 178.5, "xfade": 2.5 }
]
```

A file without `loopEnd` plays to its end, crossfading over its last 1.5 s.
