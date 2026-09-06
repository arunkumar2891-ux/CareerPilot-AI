# Career corpus (resume-safe)

This folder is the **source of truth** CareerPilot seeds on login.

| File | Use |
|------|-----|
| `master-resume.md` | Full bullet bank (no ATS keyword appendix). The **CareerPilot AI** project block is bundled into Edge Functions and synced to your Google Doc (features, architecture, bullets + live metrics). Run `npm run sync:corpus` after editing that section. |
| `two-page-template.md` | Length/layout target for tailored PDFs |
| `experience-bullets.md` | Short bullets / cover letter helpers |
| `ats-keywords.md` | Keyword lists for the optimizer prompt context |
| `role-playbooks.json` | Six JD playbooks (architect, GenAI, FDE, cloud, AI/ML, EM) |
| `evidence-chunks.json` | Allowed metrics only |

Sensitive review packages, RCA, and daily logs stay under `src/resources/` and are gitignored. Do not add them here.
