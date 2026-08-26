# SnapLogic Automations Portal Architecture

## Overview
Full-stack developer platform (React + Express + Gemini AI) serving 100+ team members with self-service SnapLogic pipeline operations, AI-powered story creation, and conversational AI agents.

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React 18)                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Components (48 shadcn/ui components)                 │   │
│  │ ├── Forms (Dynamic form system)                      │   │
│  │ ├── Tables (Request history, metrics)                │   │
│  │ ├── Cards (Status, metrics, analytics)               │   │
│  │ ├── Dialogs (Confirmations, details)                 │   │
│  │ └── Charts (Performance metrics, trends)             │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                  Backend (Express.js)                        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ REST API (35+ endpoints)                             │   │
│  │ ├── Form Endpoints (8 request categories)            │   │
│  │ ├── Utility Endpoints (Naming, validation)           │   │
│  │ ├── AI Endpoints (Story creation, analysis)          │   │
│  │ ├── Analytics Endpoints (Metrics, performance)       │   │
│  │ └── Admin Endpoints (Configuration, monitoring)      │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                  Integration Layer                           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ JIRA Integration (Create tickets)                    │   │
│  │ BigQuery Integration (Store requests, metrics)       │   │
│  │ Pub/Sub Integration (Async processing)               │   │
│  │ Slack Integration (Notifications)                    │   │
│  │ Vertex AI Integration (Gemini LLM)                   │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                  External Services                           │
│  ├── Google Cloud Pub/Sub (Event streaming)                 │
│  ├── BigQuery (Data persistence)                            │
│  ├── Vertex AI (Gemini 2.5 Flash/Pro)                       │
│  ├── JIRA API (Ticket management)                           │
│  ├── Slack API (Notifications)                              │
│  └── SnapLogic API (Pipeline operations)                    │
└─────────────────────────────────────────────────────────────┘
```

## Frontend Architecture

### Technology Stack
- **Framework:** React 18 with TypeScript
- **Build Tool:** Vite (fast development)
- **Styling:** Tailwind CSS + shadcn/ui
- **State Management:** React Context + Hooks
- **HTTP Client:** Axios with interceptors
- **Form Handling:** React Hook Form + Zod validation

### Component Structure (48 Components)
```
App/
├── Layout/
│   ├── Header (Navigation, user menu)
│   ├── Sidebar (Request categories)
│   └── Footer (Help, feedback)
├── Pages/
│   ├── Dashboard (Overview, recent requests)
│   ├── Migration (Migration requests)
│   ├── Comparison (Pipeline comparison)
│   ├── Review (Code review requests)
│   ├── Confluence (Documentation requests)
│   ├── Naming (Naming convention requests)
│   ├── UnitTesting (Unit test requests)
│   ├── Logging (Logging requests)
│   └── StoryCreator (AI story creation)
├── Forms/
│   ├── DynamicForm (Generic form builder)
│   ├── MigrationForm (Migration-specific)
│   ├── ComparisonForm (Comparison-specific)
│   └── StoryCreatorForm (Story creation)
├── Components/
│   ├── RequestCard (Display requests)
│   ├── MetricsChart (Performance metrics)
│   ├── StatusBadge (Request status)
│   ├── LoadingSpinner (Loading state)
│   └── ErrorBoundary (Error handling)
└── Utils/
    ├── api.ts (API client)
    ├── validators.ts (Form validation)
    └── formatters.ts (Data formatting)
```

## Backend Architecture

### Technology Stack
- **Runtime:** Node.js
- **Framework:** Express.js
- **Language:** TypeScript
- **Database:** BigQuery
- **Message Queue:** Google Cloud Pub/Sub
- **Authentication:** JWT + Session-based
- **Logging:** Datadog APM

### API Endpoints (35+)

#### Form Endpoints (8 categories)
```
POST /api/forms/migration - Create migration request
POST /api/forms/comparison - Create comparison request
POST /api/forms/review - Create review request
POST /api/forms/confluence - Create documentation request
POST /api/forms/naming - Create naming request
POST /api/forms/unit-testing - Create unit test request
POST /api/forms/logging - Create logging request
POST /api/forms/story-creator - Create story request
```

#### Utility Endpoints
```
GET /api/utils/naming-suggestions - Get naming suggestions
POST /api/utils/validate-pipeline - Validate pipeline
GET /api/utils/pipeline-metrics - Get pipeline metrics
POST /api/utils/compare-pipelines - Compare pipelines
```

#### AI Endpoints
```
POST /api/ai/story-creator - Generate story (Gemini Flash)
POST /api/ai/error-analysis - Analyze error (Gemini Pro)
POST /api/ai/performance-analysis - Analyze performance (Gemini Pro)
POST /api/ai/chat - Multi-turn conversation (Gemini Pro)
```

#### Analytics Endpoints
```
GET /api/analytics/requests - Get request history
GET /api/analytics/metrics - Get performance metrics
GET /api/analytics/trends - Get trend analysis
GET /api/analytics/dashboard - Get dashboard data
```

#### Admin Endpoints
```
GET /api/admin/users - List users
POST /api/admin/config - Update configuration
GET /api/admin/logs - Get system logs
POST /api/admin/backup - Trigger backup
```

## Data Model

### BigQuery Tables (5 total)

#### Table 1: requests
```sql
CREATE TABLE requests (
  request_id STRING NOT NULL,
  user_id STRING NOT NULL,
  request_type STRING,
  request_data JSON,
  status STRING,
  created_timestamp TIMESTAMP,
  updated_timestamp TIMESTAMP,
  
  CONSTRAINT pk_requests PRIMARY KEY (request_id) NOT ENFORCED
);

CLUSTER BY user_id, request_type;
PARTITION BY DATE(created_timestamp);
```

#### Table 2: ai_interactions
```sql
CREATE TABLE ai_interactions (
  interaction_id STRING NOT NULL,
  request_id STRING NOT NULL,
  ai_model STRING,
  prompt TEXT,
  response TEXT,
  tokens_used INT64,
  created_timestamp TIMESTAMP,
  
  CONSTRAINT pk_ai_interactions PRIMARY KEY (interaction_id) NOT ENFORCED
);

CLUSTER BY request_id;
PARTITION BY DATE(created_timestamp);
```

#### Table 3: pipeline_metrics
```sql
CREATE TABLE pipeline_metrics (
  metric_id STRING NOT NULL,
  pipeline_name STRING,
  snap_count INT64,
  execution_time_ms INT64,
  success_rate FLOAT64,
  error_count INT64,
  measured_timestamp TIMESTAMP,
  
  CONSTRAINT pk_pipeline_metrics PRIMARY KEY (metric_id) NOT ENFORCED
);

CLUSTER BY pipeline_name;
PARTITION BY DATE(measured_timestamp);
```

#### Table 4: users
```sql
CREATE TABLE users (
  user_id STRING NOT NULL,
  email STRING NOT NULL,
  name STRING,
  role STRING,
  created_timestamp TIMESTAMP,
  last_login TIMESTAMP,
  
  CONSTRAINT pk_users PRIMARY KEY (user_id) NOT ENFORCED
);
```

#### Table 5: audit_log
```sql
CREATE TABLE audit_log (
  log_id STRING NOT NULL,
  user_id STRING NOT NULL,
  action STRING,
  resource_type STRING,
  resource_id STRING,
  timestamp TIMESTAMP,
  
  CONSTRAINT pk_audit_log PRIMARY KEY (log_id) NOT ENFORCED
);

CLUSTER BY user_id;
PARTITION BY DATE(timestamp);
```

## AI Integration

### Gemini 2.5 Flash (Story Creator)
- **Purpose:** Generate SnapLogic pipeline stories
- **Latency:** <2 seconds
- **Retry Strategy:** 3x retry with exponential backoff
- **Prompt Engineering:** Few-shot examples for consistency
- **Output:** Formatted story with context

### Gemini 2.5 Pro (AI Agents)
- **Purpose:** Multi-turn error analysis and performance analysis
- **Latency:** 2-5 seconds
- **Conversation History:** Maintained in session
- **RAG Corpus:** 50+ pipeline analysis metrics
- **Output:** Detailed analysis with recommendations

### RAG Corpus
```
├── Error Patterns (100+ documented)
├── Performance Metrics (50+ metrics)
├── Best Practices (30+ practices)
├── Troubleshooting Guides (20+ guides)
└── Architecture Patterns (15+ patterns)
```

## Deployment Architecture

### Kubernetes Deployment
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: snaplogic-portal
spec:
  replicas: 3
  selector:
    matchLabels:
      app: snaplogic-portal
  template:
    metadata:
      labels:
        app: snaplogic-portal
    spec:
      containers:
      - name: portal
        image: gcr.io/project/snaplogic-portal:latest
        ports:
        - containerPort: 3000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: portal-secrets
              key: database-url
        - name: VERTEX_AI_KEY
          valueFrom:
            secretKeyRef:
              name: portal-secrets
              key: vertex-ai-key
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
```

### Horizontal Pod Autoscaler
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: snaplogic-portal-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: snaplogic-portal
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

## Security Architecture

### Authentication
- **OTP via Slack DM:** 6-digit OTP with 5-minute expiry, 60-second cooldown between requests
- **Dual-Storage OTP:** Redis primary with in-memory fallback (graceful degradation)
- **Session Cookies:** httpOnly cookies with 60-min TTL
- **Domain Enforcement:** Self-service registration restricted to `@paloaltonetworks.com`
- **Service Accounts:** For backend services (GCP IAM)

### Authorization
- **Role-Based Access Control (RBAC):** CoE (all permissions) vs Developer (no admin permissions)
- **8 Granular Permissions:** admin.portal, admin.maintenance, admin.users, admin.config, admin.agent, admin.metrics, pipeline.analysis.all, flow.migration.prod
- **Server-Side Enforcement:** `requirePermission` middleware on all protected routes
- **Route Guards:** RequireAuth, PublicOnly, RequireCoe (frontend)

### Security Controls
- **Same-Origin Mutation Guard:** Blocks cross-site POST/PUT/PATCH/DELETE if cookie-authenticated
- **CORS Origin Validator:** Trusted origin whitelist
- **Request ID Tracking:** In all security logs
- **Atomic OTP Consumption:** OTP invalidated on first use

### Data Protection
- **Encryption at Rest:** BigQuery encryption
- **Encryption in Transit:** TLS 1.3
- **Secrets Management:** Vault Agent sidecar
- **Input Validation:** Whitespace trimming, type validation, Zod schemas
- **Immutable Audit Trail:** Object.freeze on persisted events, pluggable writer, composite dedup key

## Portal Features (August 2026 — Current State)

### 11-Step Governed SDLC Workflow
1. Story Creator (AI-powered, Gemini 2.5 Flash)
2. Compare (Dev vs Prod pipeline diff)
3. New Logging (logging framework integration)
4. Naming Convention (snap naming validation)
5. Unit Testing (test request submission)
6. Review (AI-powered code review)
7. Migration QA/UAT/Prod (multi-stage tracking)
8. E2E Testing & Sign-off (manual checkpoint)
9. Create CR in SNOW (ServiceNow form)
10. Migration Prod (production deployment)
11. Confluence (auto-documentation)

Features: dependency gating, live JIRA status hydration, admin bypass, configurable category ordering.

### AI Agent Chat (2 Agents, 11 Tools)
- **Error Analysis Agent** — tools: execute_bigquery_sql, count_weekly_errors, top_failing_pipelines, recent_errors_for_pipeline, search_jira_tickets
- **Pipeline Performance Agent** — tools: execute_bigquery_sql, list_analysis_runs, top_failing_pipelines_pa, pipeline_execution_details, performance_comparison, bottleneck_analysis
- Multi-turn tool-calling loop (5 iterations max)
- BigQuery-persisted chat history (agent_sessions table)
- Session management (create, switch, delete)
- Admin-only access (admin.agent permission)

### Pipeline Performance Analysis
- Two-step async analysis (discovery + summary, then deep patterns)
- 50+ KPIs per execution (SLA, stability, throughput, bottleneck, severity P1-P4, idle %, memory pressure, compute intensity, document velocity)
- 6-tab dashboard (Overview, Engineering, Infrastructure, Executions, Patterns, Load Projection)
- Load Projection Simulator (1.5x-8x+ with non-linear degradation)
- AI-powered pattern insights
- Three modes: Pipeline, Project, All Pipelines (admin-only)
- Excel export, JIRA auto-creation, Slack notification

### Admin Console (4 Tabs)
- **Configuration:** General (orgs, projects, categories), Agent (prompts, tools, suggestions), Analyze (environments, issues), Features (toggles)
- **Maintenance:** Global and per-category maintenance flags with custom messages
- **Operations:** Disable/enable scheduled production tasks
- **Roles:** Promote/demote users between CoE and Developer

### Additional Utilities
- **Pub/Sub Utility:** Topic/subscription creation with attribute filtering (AND/OR), cross-project support
- **Log Analysis:** 7+ environments, 22+ issue types, Quote type detection (EDI/Non-EDI)
- **Retry Mechanism:** Re-submit failed requests, JIRA comment, BigQuery update, Slack alerts
- **Flow Status:** Aggregated per-story status map, manual step persistence

## Backend Architecture (Post-Refactoring)

```
backend/
├── server.js (entry point)
├── routes/
│   ├── authRoutes.js
│   ├── flowRoutes.js
│   ├── agentRoutes.js
│   ├── pipelineAnalysisRoutes.js
│   ├── pubsubAnalyzeRoutes.js
│   ├── retryRoutes.js
│   ├── adminRoutes.js
│   ├── maintenanceLookupRoutes.js
│   └── systemRoutes.js
└── lib/
    ├── security.js (CORS, mutation guard)
    ├── accessControl.js (RBAC, 8 permissions)
    ├── auditTrail.js (immutable events)
    ├── otpService.js (dual-storage OTP)
    ├── sessionStore.js
    ├── sessionAdapter.js
    ├── redisClient.js
    ├── requestContext.js
    ├── maintenanceStore.js
    ├── otpStore.js
    └── startupLifecycle.js
```

Refactored from 5,769-line monolith → 9 route modules + 11 lib modules (August 20, 2026).

## Monitoring & Observability

### Metrics
- Request latency (p50, p95, p99)
- Error rate (by endpoint)
- AI token usage (by model)
- Database query performance
- Kubernetes resource utilization

### Logging
- Application logs (Datadog APM)
- Access logs (Datadog)
- Error logs (Datadog)
- Audit logs (BigQuery — immutable)

### Alerting
- High error rate (>1%)
- High latency (>5s)
- AI token quota exceeded
- Database connection pool exhausted
- Pod restart loops
- Stuck analysis cleanup (>2hr processing jobs auto-failed on startup)

## Performance Metrics

| Metric | Target | Actual |
|--------|--------|--------|
| API Response Time | <500ms | <300ms |
| Portal Load Time | <2s | <1.5s |
| AI Story Generation | <2s | <1.8s |
| Error Analysis | <5s | <4.2s |
| Concurrent Users | 100+ | 150+ |
| Uptime | 99.9% | 99.95% |

## Technology Stack (Current)

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 18, TypeScript, Vite 7, Tailwind CSS, shadcn/ui (~48 components), React Router v6, TanStack React Query, Zod, Sonner, Lucide React, date-fns, Recharts |
| **Backend** | Node.js, Express 4, compression, cookie-parser, undici 8, google-auth-library, @google-cloud/pubsub, @slack/web-api, nodemailer, xlsx, express-rate-limit |
| **AI/LLM** | Gemini 2.5 Flash (Story Creator), Gemini 2.5 Pro (Agent Chat with function-calling tools) |
| **GCP** | BigQuery (7 tables), Pub/Sub, Vertex AI |
| **External** | JIRA REST API v2, SnapLogic Triggered Tasks, SnapLogic Runtime API (multi-org), Datadog Logs Analytics API, Slack |
| **Deploy** | Multi-stage Dockerfile, Helm chart, Harness CI (Blackduck, Checkmarx, GCR push), Datadog APM, Vault Agent sidecar |

---

*SnapLogic Automations Portal Architecture*  
*Last Updated: August 25, 2026*
