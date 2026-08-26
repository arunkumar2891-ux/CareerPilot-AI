export const ROLE_PLAYBOOKS = [
  {
    "id": "integration_architect",
    "title": "Integration Architect",
    "matchKeywords": [
      "integration architect",
      "ipaas",
      "snaplogic",
      "mulesoft",
      "boomi",
      "middleware",
      "etl",
      "elt",
      "event-driven",
      "api design",
      "enterprise integration"
    ],
    "leadWith": [
      "FW_Flex Integration Pipeline Redesign & Standardization",
      "PC to CC Migration - Datadog to BigQuery State Management"
    ],
    "emphasize": [
      "SnapLogic",
      "iPaaS",
      "API design",
      "event-driven architecture",
      "standardization",
      "error handling"
    ],
    "highlight": [
      "66% snap reduction",
      "278 to 94 snaps",
      "Common Pipeline Framework",
      "3-tier acknowledgment"
    ],
    "deemphasize": [
      "personal projects unless the JD mentions full-stack or GenAI"
    ]
  },
  {
    "id": "genai_developer",
    "title": "GenAI Developer",
    "matchKeywords": [
      "genai",
      "generative ai",
      "prompt engineering",
      "cursor",
      "chatgpt",
      "llm developer",
      "ai-augmented",
      "ai native",
      "copilot"
    ],
    "leadWith": [
      "GenAI-Augmented Development Methodology",
      "SnapLogic Automations Portal"
    ],
    "emphasize": [
      "AI pair programming",
      "prompt engineering",
      "RAG optimization",
      "rapid prototyping"
    ],
    "highlight": [
      "4+ production apps using AI",
      "10x development speed",
      "RAG inconsistency 40% to <5%",
      "Pic-Reel",
      "IPL 2026",
      "PlanItX"
    ],
    "deemphasize": [
      "pure SnapLogic pipeline internals unless the JD also asks for iPaaS"
    ]
  },
  {
    "id": "forward_deployment",
    "title": "Forward Deployment Engineer",
    "matchKeywords": [
      "forward deployment",
      "fde",
      "solutions engineer",
      "customer engineer",
      "field engineer",
      "customer-facing",
      "rapid prototyping",
      "production debugging"
    ],
    "leadWith": [
      "Forward Deployment Engineering",
      "SnapLogic Automations Portal"
    ],
    "emphasize": [
      "problem identification",
      "rapid solution delivery",
      "production debugging",
      "customer engagement",
      "Kubernetes",
      "CI/CD"
    ],
    "highlight": [
      "real-world problem to working app",
      "user adoption 100+",
      "distributed systems debugging"
    ],
    "deemphasize": [
      "deep SnapLogic snap-count tables unless relevant"
    ]
  },
  {
    "id": "cloud_architect",
    "title": "Cloud Architect",
    "matchKeywords": [
      "cloud architect",
      "gcp",
      "google cloud",
      "kubernetes",
      "gke",
      "bigquery",
      "pub/sub",
      "terraform",
      "helm",
      "cloud native"
    ],
    "leadWith": [
      "PC to CC Migration - Datadog to BigQuery State Management",
      "SnapLogic Automations Portal"
    ],
    "emphasize": [
      "GCP",
      "BigQuery",
      "Pub/Sub",
      "Kubernetes",
      "Vertex AI",
      "zero-data-loss",
      "auto-scaling"
    ],
    "highlight": [
      "4-10x query latency",
      "10-80x cost reduction",
      "GKE HPA 3-10 pods",
      "99.95% uptime"
    ],
    "deemphasize": [
      "personal side projects unless cloud/DevOps is mentioned"
    ]
  },
  {
    "id": "ai_ml_engineer",
    "title": "AI/ML Engineer",
    "matchKeywords": [
      "ai engineer",
      "ml engineer",
      "machine learning",
      "vertex ai",
      "rag",
      "gemini",
      "ai agent",
      "nlp",
      "embeddings"
    ],
    "leadWith": [
      "SnapLogic Automations Portal AI features",
      "GenAI-Augmented Development Methodology"
    ],
    "emphasize": [
      "Gemini",
      "RAG",
      "prompt engineering",
      "AI agents",
      "Vertex AI",
      "multi-turn conversations"
    ],
    "highlight": [
      "2 AI agents",
      "multi-turn conversations",
      "<2s latency",
      "50+ pipeline metrics RAG corpus"
    ],
    "deemphasize": [
      "FW_Flex snap reduction details unless architecture is also required"
    ]
  },
  {
    "id": "engineering_manager",
    "title": "Engineering Manager / Lead",
    "matchKeywords": [
      "engineering manager",
      "engineering lead",
      "tech lead",
      "team lead",
      "people manager",
      "mentoring",
      "stakeholder"
    ],
    "leadWith": [
      "Leadership & Mentoring",
      "major initiatives as delivery proof"
    ],
    "emphasize": [
      "team mentoring",
      "cross-functional collaboration",
      "stakeholder management",
      "documentation",
      "standards"
    ],
    "highlight": [
      "5+ mentees",
      "30+ trained",
      "3 major initiatives",
      "3348 lines of documentation"
    ],
    "deemphasize": [
      "low-level snap/SQL implementation detail"
    ]
  }
] as const;

export const EVIDENCE_CHUNKS = [
  {
    "id": "fw-flex-total",
    "tags": [
      "fw_flex",
      "snaplogic",
      "standardization",
      "integration"
    ],
    "text": "FW_Flex redesign: 20 fragmented pipelines to 3 common + 9 worker pipelines; 66% snap reduction (278 to 94 snaps), 164 snaps removed from maintenance."
  },
  {
    "id": "fw-flex-reuse",
    "tags": [
      "fw_flex",
      "reuse",
      "error-handling"
    ],
    "text": "Common Pipeline Framework consolidated 5 duplicate TMS lookups, 3 duplicate CSP API calls, and 9 duplicate error handlers; unified 4 logging patterns into COM0005 Chronosphere logging."
  },
  {
    "id": "fw-flex-spec",
    "tags": [
      "fw_flex",
      "documentation"
    ],
    "text": "979-line technical specification with snap-level details enabled parallel team implementation of FW_Flex."
  },
  {
    "id": "pc-cc-latency",
    "tags": [
      "pc_cc",
      "bigquery",
      "performance",
      "gcp"
    ],
    "text": "PC to CC migration: query latency improved 4-10x (2-5s Datadog lookups to under 500ms BigQuery); state lookup 20-50x faster (<100ms)."
  },
  {
    "id": "pc-cc-cost",
    "tags": [
      "pc_cc",
      "bigquery",
      "cost"
    ],
    "text": "PC to CC: 10-80x cost reduction per query vs Datadog API lookups; unlimited retention vs 15-day Datadog limit; zero data loss via dual-write."
  },
  {
    "id": "pc-cc-schema",
    "tags": [
      "pc_cc",
      "sql",
      "idempotency"
    ],
    "text": "BigQuery MERGE for idempotent writes; DATE partitioning and clustering; 5 pipelines changed (7 snaps removed, 13 added, 8 modified); 4-phase rollout."
  },
  {
    "id": "portal-users",
    "tags": [
      "portal",
      "fullstack",
      "adoption"
    ],
    "text": "SnapLogic Automations Portal: 100+ internal users (150+ concurrent), 48 React components, 35+ REST endpoints, 8 request categories."
  },
  {
    "id": "portal-slo",
    "tags": [
      "portal",
      "sre",
      "kubernetes"
    ],
    "text": "Portal SLOs: 99.95% uptime, <300ms API, <1.5s page load; GKE Helm + HPA 3-10 pods; Vault secret injection; Datadog APM."
  },
  {
    "id": "portal-ai",
    "tags": [
      "portal",
      "gemini",
      "rag",
      "agents"
    ],
    "text": "Portal AI: Gemini 2.5 Flash stories (<2s, 3x retry); Gemini 2.5 Pro Error Analysis + Pipeline Performance agents; RAG corpus of 50+ pipeline metrics."
  },
  {
    "id": "incident-licensing",
    "tags": [
      "incident",
      "observability",
      "pubsub"
    ],
    "text": "P1 Licensing logging loss at quarter-end: root cause in 20 min, Pub/Sub+Chronosphere fix in 30 min, team unblocked in 60 min; zero business impact, zero data loss."
  },
  {
    "id": "security-three",
    "tags": [
      "security",
      "compliance",
      "vault"
    ],
    "text": "3 security issues resolved (SNAPLOGIC-631 input sanitization, Vault 90-day password rotation, SFDC OAuth/URL review); 100% Mythos/Checkmarx/Blackduck compliance."
  },
  {
    "id": "leadership",
    "tags": [
      "leadership",
      "mentoring",
      "docs"
    ],
    "text": "Mentored 5+ engineers; workshops for 30+ people; 3,348 lines of technical documentation; 15+ production deployments with zero rollbacks."
  },
  {
    "id": "ai-agents-value",
    "tags": [
      "agents",
      "roi",
      "productivity"
    ],
    "text": "AI agent platforms: 540+ hours/year saved, ~$40K annual value, 2,000-3,000% ROI; quote investigation 85-90% faster (3-4 min to 30-40 sec)."
  },
  {
    "id": "synthetic-monolith",
    "tags": [
      "refactor",
      "reliability"
    ],
    "text": "Synthetic monitoring 27 to 2 pipelines (93% reduction); backend monolith 5,769 lines refactored to 9 routes + 11 libs."
  }
] as const;
