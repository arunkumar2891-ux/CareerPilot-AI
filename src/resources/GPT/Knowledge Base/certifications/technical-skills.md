# Technical Skills & Expertise

## Core Competencies

### Integration Architecture
- **SnapLogic:** 5+ years experience
- **Listener/Worker Pattern:** Designed and implemented
- **Common Pipeline Pattern:** Established standardized approach
- **Error Handling:** 3-tier acknowledgment logic
- **Logging:** Unified framework design

### Cloud Architecture
- **Google Cloud Platform:** Pub/Sub, BigQuery, Vertex AI, GKE, Agent Studio, Cloud Functions
- **Datadog:** Monitoring, logging, APM
- **Chronosphere:** Logging platform
- **Vault:** Secrets management
- **Supabase:** PostgreSQL, Auth, Row Level Security (personal projects)

### Database Architecture
- **BigQuery:** Schema design, MERGE statements, partitioning, clustering (7 tables in production)
- **PostgreSQL/Supabase:** RLS policies, stored procedures, triggers (9-12 table schemas)
- **SQL:** Complex queries, optimization, performance tuning
- **Data Modeling:** Normalization, denormalization, OLTP vs. OLAP

### Full-Stack Development
- **Frontend:** React 18/19, TypeScript, Vite 5/7, Tailwind CSS v3/v4, shadcn/ui, TanStack (Query, Router, Start)
- **Backend:** Express.js, Node.js 22, REST API design, modular architecture
- **API Design:** 35+ endpoints, RESTful patterns, async processing
- **State Management:** Zustand, TanStack Query, React Context
- **Animation:** Framer Motion, CSS transitions
- **Charting:** Recharts, custom dashboards

### AI/LLM & Generative AI
- **Google Gemini:** 1.5 Flash (CareerPilot AI primary), 2.5 Flash, 2.5 Pro, 3.5 Flash (foundation models)
- **Multi-Provider AI:** Gemini, OpenAI, Claude, Azure, Ollama, Bedrock — unified routing via Edge Function
- **GCP Agent Studio:** Agent design, instruction tuning, grounding
- **Vertex AI RAG Engine:** Custom parsing, LLM-based chunking, reranker (Gemini 2.5 Flash)
- **Google ADK (Agent Development Kit):** Multi-agent orchestration, parallel sub-agents, Python
- **RAG Architecture:** Career corpus design (role playbooks + evidence chunks + keyword-scored playbook selection + relevance-scored evidence selection)
- **Function Calling:** Multi-turn tool-calling loops (5 iterations max), 11 custom tools
- **Prompt Engineering:** Few-shot examples, system prompts with strict constraints, ATS optimization prompts, context optimization
- **AI Evaluation:** RECIPE, CASE, COSTS, PATH, AI-First Process Fit frameworks
- **Workflow Automation:** Resumable graph-based engine with 25+ AI/integration node types, pg_cron scheduling

### GenAI-Augmented Development (AI Pair Programming)
- **Cursor AI (Agent Mode):** Architecture generation, code scaffolding, debugging, full-stack development
- **Lovable.dev:** Rapid prototyping, UI generation from designs, component scaffolding
- **AI-First Methodology:** Natural language prompting → production applications ("vibecoding")
- **Proven Output:** 3 personal projects shipped concept-to-production via AI pair programming
- **Productivity Gain:** 20-25% improvement in professional work; personal projects in days/weeks vs months

### Forward Deployment Engineering (FDE)
- **Problem Identification:** Translating vague user needs into technical requirements
- **Rapid Solution Delivery:** Concept → production in days/weeks for personal projects
- **Production Debugging:** Distributed systems (Kubernetes, Pub/Sub, OAuth, gateway routing)
- **User Engagement:** Requirements gathering from 100+ users, iterative feedback loops
- **End-to-End Ownership:** Architecture, design, implementation, deployment, monitoring, user support
- **Deployment Infrastructure:** Render.com, GKE, Helm, Harness CI/CD, multi-environment

### DevOps & CI/CD
- **Kubernetes:** Deployment, HPA, resource management, Helm charts
- **Docker:** Multi-stage builds, image optimization
- **CI/CD:** Harness, automated testing, multi-registry deployment
- **Security Scanning:** Blackduck (SCA), Checkmarx (SAST), Mythos
- **SSR Deployment:** Nitro, TanStack Start, Render.com

### Security & Compliance
- **Authentication:** OAuth 2.0, JWT, OTP (Slack DM + browser-based), session-based, magic links
- **Authorization:** RBAC (8 granular permissions), Row Level Security (Supabase), resource-level controls
- **Security Controls:** CORS validation, cross-site mutation guard, audit trail, rate limiting (3-tier)
- **Input Validation:** Zod schemas, whitespace trimming, type validation
- **Secrets Management:** Vault Agent sidecar, automated password rotation

---

## Tools & Technologies

### Integration Platforms
- SnapLogic (5+ years)
- Salesforce (SFDC integration)
- JIRA (ticket management, REST API v2)
- ServiceNow (CR management)

### Cloud Services
- Google Cloud Platform (Pub/Sub, BigQuery, Vertex AI, GKE, Agent Studio)
- Datadog (monitoring, logging, APM)
- Chronosphere (logging)
- Vault (secrets management)
- Supabase (PostgreSQL BaaS, Auth, RLS, Storage, Edge Functions/Deno, pg_cron, pg_net)
- Render.com (web service + static site hosting)
- Apify (LinkedIn job scraping actor)
- Resend (transactional email)
- LaTeX compilation service (ytotech.com)

### Development Tools
- React 18/19, TypeScript, Vite 5/7
- TanStack (Query, Router, Start)
- Express.js, Node.js 22
- Tailwind CSS v3/v4, shadcn/ui (Radix)
- Zustand, Framer Motion, Recharts, dnd-kit
- FFmpeg.wasm (WebAssembly video processing)
- Git, GitHub

### Databases
- BigQuery (primary - 7 tables)
- PostgreSQL/Supabase (personal projects - 9-12 tables)
- Redis (OTP cache with fallback)

### AI/Agent Platforms
- GCP Agent Studio (Quote Journey Tracker)
- Google ADK — Python (Multi-Agent Pipeline Review)
- Vertex AI RAG Engine (knowledge base, reranking)
- Gemini Models (2.5 Flash, 2.5 Pro, 3.5 Flash)
- Cursor AI + Lovable.dev (AI pair programming)

### Monitoring & Observability
- Datadog APM
- Chronosphere logging
- OTEL (OpenTelemetry)
- Custom dashboards
- Alerting rules

---

## Personal Projects (GenAI/FDE Demonstration)

### CareerPilot AI (Flagship GenAI Project)
- **Problem:** Job searching is fragmented across tools with repetitive manual work
- **Solution:** Autonomous AI platform with RAG corpus, workflow engine, and daily automated pipeline
- **AI Method:** Runtime GenAI — Gemini 1.5 Flash for resume tailoring, RAG-like corpus with 6 role playbooks + 14 evidence chunks, multi-provider architecture
- **Stack:** React 18, Supabase (Edge Functions/Deno + pg_cron), Gemini 1.5 Flash, Apify, Google Drive, LaTeX→PDF, Resend
- **Key Technical:** Resumable 25-node workflow engine, topological sort execution, playbook keyword scoring, evidence relevance scoring, ATS system prompt with strict constraints
- **Impact:** Fully autonomous daily pipeline: LinkedIn scrape → AI optimize → PDF → Google Drive → email
- **GenAI Signal:** Most sophisticated — runtime AI, RAG, multi-provider, workflow automation, autonomous agents

### IPL 2026 Prediction Game
- **Problem:** Friends group needed a match prediction app for IPL season
- **Solution:** Full-stack platform with pari-mutuel scoring, automated lifecycle, OTP auth
- **AI Method:** Built entirely via "vibecoding" (Cursor AI + Lovable.dev)
- **Stack:** React 18, Express, Supabase (9 tables + 3 RPC), CricAPI, JWT, node-cron
- **Impact:** 29+ active users, zero manual intervention all season
- **FDE Signal:** Translated vague social need → production platform in ~2 weeks

### Cric-Scorer (Cricket Tournament Platform)
- **Problem:** Local cricket tournaments needed proper scoring and tournament management
- **Solution:** Live ball-by-ball scoring with 3 domain engines and tournament management
- **AI Method:** Scaffolded with Bolt.new, complex domain logic via AI-augmented development
- **Stack:** React 18, Supabase (14 tables + RLS + triggers + migrations)
- **Key Technical:** Stateful scoring engine (undo/redo, state rebuild, extras, 10 wicket types), stats engine (career batting/bowling/fielding, NRR), MVP engine (configurable point system)
- **Impact:** Complete tournament lifecycle from team creation to career leaderboards
- **FDE Signal:** Complex domain logic (full cricket rules) via AI-augmented development

### Pic-Reel (FrameFlow)
- **Problem:** No free browser-based tool for photographers to make hyperlapses from photos
- **Solution:** Privacy-first in-browser video maker (FFmpeg compiled to WebAssembly)
- **AI Method:** Built with Cursor AI + Lovable.dev, zero server-side processing
- **Stack:** React 19, TanStack Start (SSR/Nitro), Vite 7, FFmpeg.wasm, dnd-kit, Render.com
- **Impact:** Free tool, supports 500 images, 4K output, H.264/H.265
- **FDE Signal:** Identified gap in photographer workflow → shipped in ~1 week

### PlanItX
- **Problem:** Friends planning Indian weddings needed a comprehensive planning tool
- **Solution:** Premium event planning SaaS with India-first features
- **AI Method:** Built via AI-augmented development
- **Stack:** React 18, Supabase (12 tables + RLS), Zustand, Framer Motion, Recharts, Zod
- **Impact:** Budget tracking (INR/Lakhs), vendor marketplace, family delegation, cultural elements
- **FDE Signal:** Received social need → delivered premium SaaS product

---

## Certifications & Training

### Relevant Certifications
- (To be identified from documents)

### Training & Courses
- Google Cloud Platform training
- BigQuery optimization
- Kubernetes administration
- AI/LLM integration
- GCP Agent Studio development
- Vertex AI RAG Engine

### Continuous Learning
- AI agent architecture (Google ADK, Agent Studio)
- AI evaluation frameworks (RECIPE, CASE, COSTS, PATH)
- Modern React (19, TanStack Start, Server Components)
- WebAssembly applications (FFmpeg.wasm)
- Multi-agent orchestration patterns

---

*Technical Skills & Expertise*  
*Last Updated: August 28, 2026*
