# Hyperframes Composition Brief: CareerPilot AI

## Objective
Create a vertical 9:16 launch film for CareerPilot AI. This is a new composition, not a crop of the landscape cut.

## Output
- Composition directory: `brag-output-2026-11-06-200141/composition/`
- Rendered video: `brag-output-2026-11-06-200141/brag.mp4`
- Format: vertical — 1080x1920
- Duration: 20 seconds

## Source Material
- Project root: CareerPilot-AI
- Primary files read: `index.html`, `src/index.css`, `README.md`, `src/pages/DashboardPage.tsx`, `src/utils/job-kanban.ts`, `src/components/brand/LogoLockup.tsx`
- Product name: CareerPilot AI
- Tagline / strongest claim: "Autonomous AI job search — discovers roles, scores your match, tailors resumes and cover letters, and tracks every application."
- Key UI or visual moment to recreate: the aircraft lockup, the dashboard sentence, and a job card dropping from Discovered into Resume Ready.
- Copy that must appear verbatim:
  - Your autonomous job search command center
  - Discovered
  - Resume Ready
  - Applied
  - Newly found jobs land here
  - Tailored resume is ready to send
  - Application submitted
  - CareerPilot AI
  - Scores your match. Tailors the resume.

## Creative Direction
- Tone preset: polished
- Creative direction: quiet mission-control product film, framed for a phone
- Interpretation: one column. Type lands and stays. The board is three stacked rows, not three side-by-side columns.
- Angle: the card takes the same downward step the aircraft's route implies. The pipeline carries the role.
- Hook: aircraft centered, then "The search shouldn't be a second job."
- Outro / punchline: CareerPilot AI. Scores your match. Tailors the resume.
- Avoid:
  - Cropping the 16:9 film
  - Generic SaaS language
  - Side-by-side kanban columns that become unreadably narrow
  - Real names, emails, employers, or resume text

## LOOK
Ground `#0B120E`. Ink `#F7F5F3`. Accent `#3DA988`. Card `#131B17`. Hairline `#26312C`. Muted `#96A69D`. Display Inter 700, body Inter 400, status JetBrains Mono 400. Inter Tight is the brand face and is not bundled, so Inter stands in. One radial jade glow near the top. No full-frame linear gradient. Reading text at least 28px. Content inside the 80% title-safe box of 1080×1920. BANNED: pulsing type, waveform bars, bounce, cyan-violet ramps.

## Visual Identity
- Background: `#0B120E`
- Text: `#F7F5F3`
- Accent: `#3DA988`
- Display font: Inter (stand-in for Inter Tight)
- Body font: Inter
- Visual references: LogoLockup aircraft, dashed climb, measured baseline, kanban labels and hints, dashboard description, SUMMARY header.

## Storyboard
Use `brag-output-2026-11-06-200141/brag-plan.md`.

Scene summary:
1. Climb — 4.2s — centered aircraft and the wrapped hook
2. Command — 6.2s — dashboard sentence, then three stacked status rows
3. Board — 5.6s — card drops Discovered → Resume Ready, match stamp, SUMMARY
4. Lockup — 4.0s — CareerPilot AI and the claim, held

Northwind Labs, Staff Engineer, and match 94 are fictional stand-ins.

## Audio
- Audio role: warm bed
- Audio arc: quiet open, lift at 8.74s, stay under the drop, fade on the lockup
- Music: `assets/music/happy-beats-business-moves-vol-12-by-ende-dot-app.mp3`
- Music treatment: volume 0.34, fade-in 0.6s, fade-out 1.6s
- Music cue guidance: vol-12 preset, 109.96 BPM. Lock 8.74s, 13.11s, 17.47s. Rows on 6.56, 7.64, 8.74. Card drop starts at 11.46.
- Audio-reactive treatment: subtle. Bass 0.54 / 0.55 / 0.57 steps the jade glow. No per-frame pulse.
- Audio-coupled moments:
  - Hook line — `interface/bong_001.ogg` at 0.8s, volume 0.4, duration 0.13s
  - Card drop — `interface/drop_001.ogg` at 11.4s, volume 0.38, duration 0.11s
  - Match stamp — `impact/impactSoft_medium_001.ogg` at 13.05s, volume 0.46, duration 0.19s
- SFX analysis guidance: `.agents/skills/brag/assets/sfx/sfx-analysis.md`
- Audio files live in `composition/assets/`.

## Registry
The landscape run already searched the catalog. Hits were generic 3D and social cards, not this board. The vertical stack is drawn from the product's column labels.

## Hyperframes Instructions
1080×1920 root. Sub-compositions for atmosphere, hook, command, board, and lockup. `check` is the gate. Render locally. No voice, no captions, no SPEC.md.
