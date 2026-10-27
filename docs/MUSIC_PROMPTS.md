# Music prompts

The prompts behind Gridfall's music: generated outside the game (Gemini), dropped into
`public/audio/music/` and listed per place in its `manifest.json` (several files for one place play
at random, see that folder's README).

## What works

- **Short beats long** for a mood track: one genre, the tempo and key, 3–4 instruments, the mood as a
  picture of the place, "steady driving groove throughout". The docks' first prompt (ten instruments,
  sound effects, a section-by-section structure and a list of don'ts) came out a mess; the short one
  under it was right the first time.
- **No sound effects in the prompt** (ship horns, chains, rain, cranes): the generator puts them in
  literally, over the music.
- **Don'ts only for a known failure.** Naming a style to avoid can pull it in. The desert's long
  prompt is the exception: its first track had a dubstep middle, and spelling out what to use
  *instead* (an industrial-techno section) fixed it.
- **A bad result: generate the same prompt again** (2–3 times) before rewriting it; then change one
  word at a time (the genre, the tempo).
- For looping: the game crossfades past a fade-out (`loopEnd`, `xfade` in the manifest), so an
  ending that fades is fine; silence at either end is not.

## The prompts

### Neon Docks: `docks_theme` (the one to start from for the docks)

The result: `black_water_harbor.mp3` ("Black Water Harbor"), 88.0. Right the first time.

```
Dark cyberpunk synthwave instrumental, 125 BPM, minor key. A deep pulsing analog bassline, tight punchy drums, cold atmospheric synth pads and a simple haunting synth melody. Moody, tense and cinematic, like a night chase through a neon-lit harbour in the rain. Steady driving groove throughout.
```

### Desert Outpost: `desert_theme`

The result: `desert_theme.mp3` ("Sector Breach"), 60.1. Long on purpose: written against the first
track's dubstep middle.

```
Create an original instrumental electronic track in the same spirit as an industrial cyberpunk / darksynth action theme: dark, futuristic, driving, neon-night energy. 136 BPM, F-sharp minor. Instrumental only, no vocals.

IMPORTANT: no dubstep anywhere. No wobble bass, no LFO "wub" bass, no growling or talking bass, no half-time dubstep drops, no brostep screeches. The energy must come from relentless rhythm and drive, not from bass wobbles.

Sound palette:
- Driving sequenced synth bass in tight 16th notes (rolling, pulsing, slightly distorted, like industrial techno / darksynth), locked to the kick.
- Punchy four-on-the-floor kick, crisp snare or clap on 2 and 4, fast 16th hi-hats, metallic percussion, short glitch fills at phrase ends.
- Distorted synth power chords and stabs on the accents.
- A short, memorable synth-brass lead hook that returns.
- Fast arpeggiators, risers and impacts at transitions.

Structure (2:30–3:30, seamless loop, no fade-out, no silence at start or end):
- Starts with full energy straight away: bass sequence + drums.
- Verse: riff, drums, stabs.
- Build: riser, snare roll.
- First peak: the hook, full arps.
- MIDDLE SECTION: keep it as driving as the peaks. Instead of a dubstep drop, use a pounding industrial-techno section: straight four-on-the-floor kick, rolling 16th bass sequence that slowly opens its filter, layered percussion, call-and-response synth stabs, rising tension, then a big snare roll into the final peak. No half-time, no wobble.
- Final peak: bigger than the first, hook + everything.
- The ending leads straight back into the beginning for looping.

Mix: modern, punchy, strong low end, leave room in the upper mids, around -14 LUFS.
```

### Night Tokyo and Neon Block: `tokyo_theme`

The result: `midnight_at_the_crossing.mp3` ("Midnight at the Crossing"), 88.0. Good, but with a lot of
electronic glitches.

```
Dark electronic instrumental with a subtle Japanese touch, 125 BPM, minor key. Driving synth bass and tight electronic drums, with a lonely shakuhachi flute melody over cold synth pads. Tense, nocturnal, cinematic, rainy neon city at 3 a.m.
```

Untried, for fewer glitches: the same with a calmer production asked for.

```
Dark atmospheric electronic instrumental with a subtle Japanese touch, 120 BPM, minor key. Warm deep synth bass and soft, steady electronic drums, with a lonely shakuhachi flute melody over cold synth pads. Smooth, clean, minimal production. Tense, nocturnal, cinematic, rainy neon city at 3 a.m.
```

Tokyo's other two, `tokyo_theme.mp3` ("Violet Hour Above the Rain", 59.0) and
`black_rain_and_bamboo.mp3` (87.0), came from prompts not kept here.

### Old Port: not generated yet

A brick-and-concrete harbour on a clear morning (09:40), mercenaries: daylight, not neon. The
docks' short form, with an organic action palette. It plays `docks_theme` until it has its own.

```
Gritty cinematic action instrumental, 120 BPM, D minor. Punchy live-sounding drums, a driving distorted bass riff, low staccato strings and bold brass stabs. Tense and determined, like a firefight among old brick warehouses and rusty cranes in a sunlit harbour on a clear morning. Steady driving groove throughout.
```

Variant, closer to the game's electronic tracks:

```
Hybrid orchestral-electronic action instrumental, 124 BPM, minor key. A pulsing synth bass, hard punchy drums, low staccato strings and heavy brass hits. Bright but tense, a battle in a sunlit old harbour. Steady driving groove throughout.
```
