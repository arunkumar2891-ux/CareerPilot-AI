# Hyperframes Composition Brief: CareerPilot AI

## Objective
Create a short launch-style brag video for CareerPilot AI.

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080
- Duration: 20 seconds

## Source Material
- Project root: CareerPilot-AI
- Primary files read: `index.html`, `src/index.css`, `README.md`, `package.json`, `src/App.tsx`, `src/pages/DashboardPage.tsx`, `src/pages/JobsPage.tsx`, `src/utils/job-kanban.ts`, `src/components/brand/LogoLockup.tsx`
- Product name: CareerPilot AI
- Tagline / strongest claim: "Autonomous AI job search — discovers roles, scores your match, tailors resumes and cover letters, and tracks every application."
- Key UI or visual moment to recreate: the aircraft lockup, the dashboard command-center line, and a job card moving Discovered → Resume Ready.
- Copy that must appear verbatim:
  - Your autonomous job search command center
  - Discovered
  - Resume Ready
  - Applied
  - CareerPilot AI
  - Scores your match. Tailors the resume.

## Creative Direction
- Tone preset: polished
- Creative direction: quiet mission-control product film
- Interpretation: four scenes, long holds, mixed case, forest and jade only. Type lands and stays still.
- Angle: the aircraft's climb and the job card's move are the same idea. The pipeline carries the role. The person does not.
- Hook: aircraft traces the dashed climb, then "The search shouldn't be a second job."
- Outro / punchline: CareerPilot AI. Scores your match. Tailors the resume.
- Avoid:
  - Generic SaaS language
  - Abstract filler visuals
  - Unrelated visual redesign
  - Cyan-to-violet gradients
  - Real names, emails, employers, or resume text from the project

## LOOK
Ground `#0B120E`. Ink `#F7F5F3`. Accent `#3DA988` (brand jade, the mark's fixed colour). Forest `#14603A` is the light primary and is not used on the mark. Card `#131B17`. Hairline `#26312C`. Muted `#96A69D`. Display Inter 700, body Inter 400, status JetBrains Mono 400. Inter Tight is the brand face and is not bundled, so Inter stands in. Grid 48px at low contrast. One radial jade glow, no full-frame linear gradient. BANNED: pulsing type, waveform bars, bounce on UI, cyan-violet ramps, invented metrics presented as facts.

## Visual Identity
- Background: `#0B120E`
- Text: `#F7F5F3`
- Accent: `#3DA988`
- Display font: Inter (stand-in for Inter Tight)
- Body font: Inter
- Visual references from the project: LogoLockup aircraft path, dashed climb, measured baseline, kanban column labels, dashboard description, SUMMARY section header.

## Storyboard
Use the storyboard in `brag-output/brag-plan.md` as the creative contract.

Scene summary:
1. Climb — 4.2s — aircraft trajectory and the hook line
2. Command — 6.2s — dashboard sentence, then Discovered / Scored / Tailored
3. Board — 5.6s — sample card slides Discovered → Resume Ready, match stamp, SUMMARY
4. Lockup — 4.0s — CareerPilot AI and the claim, held

Northwind Labs, Staff Engineer, and the match number 94 are fictional stand-ins for the board. They are not a user's job or a published statistic.

## Audio
- Audio role: warm bed
- Audio arc: quiet open, lift at the first strong beat, stay under the card, fade on the lockup
- Music: `assets/music/happy-beats-business-moves-vol-12-by-ende-dot-app.mp3`
- Music treatment: `data-volume` about 0.34, fade-in about 0.6s, fade-out about 1.6s. Credit in share copy: Music: Sascha Ende, ende.app (CC BY 4.0).
- Music cue guidance: bundled preset for vol-12, 109.96 BPM. Lock 8.74s, 13.11s, and 17.47s. Status words on 6.56, 7.64, 8.74. Card move starts at 11.46.
- Audio-reactive treatment: subtle. Bass extracted at 30fps from the bed (8.74 → 0.54, 13.11 → 0.55, 17.47 → 0.57) steps the jade glow's opacity and scale. No per-frame pulse.
- Audio-coupled moments:
  - Hook line — soft interface accent
  - Status words — beat grid, no extra hits
  - Card move — drop at the start of the slide
  - Match stamp — warm soft impact
  - Wordmark — glow only, bed fading
- SFX selection guidance: polished, low high-frequency risk. `interface/bong_001.ogg`, `interface/drop_001.ogg`, `impact/impactSoft_medium_001.ogg`. Volumes under the music policy (softer than 0.85).
- SFX analysis guidance: `.agents/skills/brag/assets/sfx/sfx-analysis.md`
- Exact SFX choice: those three files, placed on their own tracks above the bed.
- Audio files: copied into `brag-output/composition/assets/`.

## Registry
Catalog queries for a product dashboard card and a kanban card returned generic 3D reveals and social cards (`ui-3d-reveal`, `orbit-card`, `x-post`). None of them are this board or this lockup, so the UI is drawn from the product source.

## Hyperframes Instructions
Composition contract, motion, and look from the Hyperframes skills. No SPEC.md, no storyline menu, no voice, no captions. `check` is the gate. Render locally.
