# Brag Plan: CareerPilot AI

## What is this app?
CareerPilot AI is an autonomous job-search workspace. It discovers roles, scores the match against a master resume, tailors the resume, and tracks every application on a board.

## The angle
A quiet mission-control film. The product already looks like a route: a jade aircraft climbs a dashed line, then a job card takes the same trip across the board. No startup joke. The work moves; the person does not have to.

## Hook (first 2-3 seconds)
The lockup's aircraft climbs the dashed trajectory on the dark ground. One line lands under it: "The search shouldn't be a second job."

## Key moments (the middle)
- The dashboard line, verbatim: "Your autonomous job search command center." Three status words arrive one by one: Discovered, Scored, Tailored.
- A sample job card, Northwind Labs / Staff Engineer, slides from Discovered to Resume Ready. Those column names are the real board. The company, title, and match number 94 are fictional stand-ins, not a user's data.
- The match stamp lands, then the resume contract's SUMMARY header appears. The card has a tailored resume, which is what Resume Ready means.

## Outro / punchline
The lockup again, still. "CareerPilot AI." Then the site's own claim, split into two beats: "Scores your match. Tailors the resume."

## User flow worth showing
Entry: the dashboard command center as a daily run starts. Key action: a discovered job is scored. Result: the card lands in Resume Ready with a tailored resume.

## Tone
- Preset: polished
- Creative direction: quiet mission-control product film
- Interpretation: four scenes, long holds, mixed case, no bounce, no cyan-violet gradient, no generic SaaS verbs. Motion is the card and the aircraft, not the type.

## Format: landscape — 1920x1080
## Duration: 20 seconds

## Visual identity (from the project)
- Background: `#0B120E` (dark `theme-color`; computed token `#0C130F`)
- Accent: `#3DA988` (`--brand-jade`, fixed on both themes). Forest `#14603A` is the light-theme primary and is not the mark.
- Text: `#F7F5F3` (dark foreground). Muted `#96A69D`. Card `#131B17`. Hairline `#26312C`.
- Display font: Inter Tight is the brand face. Hyperframes does not bundle it, so the film uses Inter (700 headlines, 400 body), the closest bundled family.
- Body font: Inter. Status labels: JetBrains Mono, which the product uses and Hyperframes bundles.
- Strongest visual element: the aircraft lockup (origin plane, dashed climb, destination plane, measured baseline) and the jobs kanban.

## Share copy (draft)
Introducing CareerPilot AI: autonomous job search that discovers roles, scores your match, and tailors the resume.
Built as a React workspace on a resumable pipeline.

## Audio direction
- Role: warm bed
- Music: `happy-beats-business-moves-vol-12-by-ende-dot-app.mp3` (109.96 BPM). Cue preset: `.agents/skills/brag/assets/music/cues/happy-beats-business-moves-vol-12-by-ende-dot-app.music-cues.json`
- Music treatment: bed from 0, volume about 0.34, short fade-in, fade under the final lockup. Never above 0.5.
- Music cue guidance: strong cues for the three major landings, 8.74s (third status word), 13.11s (match stamp), 17.47s (wordmark). Status words snap to every other beat: 6.56, 7.64, 8.74. The card starts its move on 11.46. Ignore any cue that shortens a read.
- Audio-reactive treatment: subtle. A jade radial glow steps up with extracted bass at those three cues (bass about 0.54, 0.55, 0.57). No waveform, no idle pulse.
- SFX posture: polished, three sounds. Soft accent on the hook, a drop as the card leaves, a warm impact as the match lands.
- Audio-coupled moments: status words, the card move, the match stamp, the wordmark.
- Restraint rule: no casino hits, no stacks, no ducking (there is no voice).

## Storyboard

### Scene 1 — Climb — 4.2s
Dark ground, hairline grid, the aircraft tracing its climb. The hook line holds under the mark.
Sequential/interaction: the trajectory draws, then the line. Not a list.
Audio intent: the bed is still quiet here. One soft accent as the line arrives.
Audio-coupled idea: none beyond that accent. The opening bass is nearly silent, so the glow stays dim.
Music: warm bed, low.
Transition mood: soft → Scene 2

### Scene 2 — Command — 6.2s
Eyebrow DASHBOARD. The verbatim line "Your autonomous job search command center." Then Discovered, Scored, Tailored, each held.
Sequential/interaction: yes. The three words arrive on 6.56, 7.64, and 8.74 and stay together.
Audio intent: the third word meets the first loud beat. The glow opens.
Audio-coupled idea: three short labels, every other beat, then a hold of the full set.
Music: bed lifts with the beat at 8.74s.
Transition mood: soft → Scene 3

### Scene 3 — Board — 5.6s
Job Discovery. Three real columns: Discovered, Resume Ready, Applied. A sample card (Northwind Labs, Staff Engineer) sits in Discovered, slides into Resume Ready on the 11.46 beat, then a match stamp of 94 lands on the 13.11 cue. SUMMARY appears under it, the real resume section.
Sequential/interaction: yes. Simulated move between columns, then the score, then the section header.
Audio intent: a soft drop as the card leaves, a warm impact as the score lands.
Audio-coupled idea: card move on the beat grid, score on the strong cue.
Music: bed stays under the move.
Transition mood: soft → Scene 4

### Scene 4 — Lockup — 4.0s
The same aircraft mark, still. CareerPilot AI. Then "Scores your match. Tailors the resume." Held to the end.
Sequential/interaction: wordmark, then the claim. No list.
Audio intent: the bed fades. The wordmark meets the 17.47 cue. No extra hit.
Audio-coupled idea: wordmark on the strong cue. Glow takes the last bass step.
Music: fade out through the hold.
Transition mood: none. The last frame holds.

**Music mood for this video:** upbeat but held back, a warm corporate bed under a slow film.
**Audio summary:** Quiet open, three status words, the card crosses the board on a beat, the match stamps on a strong cue, and the lockup lands as the bed fades.
