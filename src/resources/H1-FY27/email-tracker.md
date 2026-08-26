# H1 FY27 Email Tracker

## How to Use

- **Compose**: Ask the agent "Draft an email to [person] about [topic]" — it will write the email and log it here
- **Log**: Say "Log email: sent [subject] to [person]" to record an already-sent email
- **Follow up**: Ask "What emails need follow-up?" to get a list of pending items
- **Status update**: Say "Mark email #N as replied" to update tracking

---

## Status Legend


| Status           | Meaning                              |
| ---------------- | ------------------------------------ |
| `drafted`        | Composed but not yet sent            |
| `sent`           | Sent, no response expected or needed |
| `awaiting-reply` | Sent, waiting for a response         |
| `replied`        | Recipient responded                  |
| `follow-up-sent` | Sent a follow-up nudge               |
| `closed`         | Thread complete, no further action   |


---

## Email Log




| #   | Date       | To                        | Subject                                                                        | Status         | Follow-up By | Notes                                                                                                                              |
| --- | ---------- | ------------------------- | ------------------------------------------------------------------------------ | -------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| 16  | 2026-08-24 | [Team], Jayesh            | RE: 904K Files Cleanup — Progress Update & Confirmation to Delete All *.json   | sent           | 2026-08-25   | Follow-up to #15; deleted Error_*.json in UAT; only 19K in Prod; need Jayesh to confirm OK to delete all *.json; retain .jks/.expr |
| 15  | 2026-08-21 | [Team/Project Owner]      | RE: Security Compliance — 904K Files — Requesting Monday Morning Sync          | sent           | 2026-08-25   | Reply to #14; acknowledged their plan; requesting meeting by Monday AM IST due to operability bottleneck                           |
| 14  | 2026-08-21 | [Team/Project Owner]      | URGENT: Security Compliance — 904K Files with Business Data in IOT_SASE/FW_FlexIntegration | sent           | 2026-08-25   | ~904,585 files with support_account_id, authcodes, serial numbers violate data retention policy; requesting prioritized deletion    |
| 13  | 2026-08-14 | [Team]                    | Aug 20th NPI Deployment — Sign-off Withheld Pending Review Comments             | sent           | 2026-08-18   | Second time requesting sign-off without following process; exception given Jul 14; SNAPLOGIC-1302/1303/1304 must be addressed first |
| 12  | 2026-08-13 | [Team/SnapLogic Support]   | RCA: Scheduled Pipeline Failures Post Snaplex 4.45 GA — pipe.plexPath Error    | sent           | —            | pipe.plexPath.split('/')[1] fails only for scheduled tasks after 4.45 upgrade; works in manual/ultra; regression                   |
| 11  | 2026-08-12 | [Leaders]                 | Introducing Quote Journey Tracker Agent — AI-Powered Quote Diagnosis           | sent           | —            | Functional overview for leadership; 85-90% faster analysis; 23 issue patterns; Slack delivery; JIRA integration                    |
| 10  | 2026-08-11 | Daniel Marquez, Sarika    | RE: PC_To_CC Migration — ServiceNow Incident Notification                      | sent           | —            | Confirmed SNOW incident creation + progress comments is expected behavior per requirements; assignment group gets email notifications |
| 9   | 2026-08-11 | Kamesh (SRE)              | Synthetic Monitoring — 401 Auth Failures Generating False Alarms               | sent           | —            | 401 auth errors on synthetics despite healthy interfaces; false alarms; asking to investigate credential/token issue                |
| 8   | 2026-08-10 | [Team/Sender]             | INC2271589 Investigation — SnapLogic Pipeline Failure Analysis (Jun 25–26)     | sent           | —            | 1506 executions analyzed; 10 critical failures, 49 degraded; JIRA DC 401s, SFDC rate limits, missing asset, child pipeline errors   |
| 7   | 2026-08-07 | [Team/Sender]             | RE: Quote Transmission Error — Chronosphere Migration Update                   | sent           | —            | Confirmed Datadog-to-Chronosphere migration handled; design ready, dev starts Aug 10, deploy Aug 13                                |
| 6   | 2026-08-05 | Vaishnavi Suyog           | RE: Code Review Approval — INT0002_SUB02_GCP_User_Create_Update_Docebo_Batch   | sent           | 2026-08-07   | Approval conditional on ETA for full standardization (camelCase + Key_Tracking_ID) across 4 pipelines                              |
| 5   | 2026-08-05 | Akhil (SRE Observability) | Follow-up: New Synthetic Monitoring Endpoints — Setup & Validation Status      | sent           | —            | Checking if new synthetics are configured; parallel validation results; decommission timeline                                      |
| 4   | 2026-08-04 | Pradip Rawat              | Guidance Needed: Automating Infusion in SnapLogic Cert Renewal                 | sent           | 2026-08-05   | Seeking guidance on Infusion automation for cert renewal; rest to be automated with shell/Ansible                                   |
| 3   | 2026-08-03 | Director                  | LMS Integration Platform (5 Major Initiatives)                                 | sent           | —            | 5 major initiatives: Demostack Partner Logic, Demostack Refactoring, Accredible Integration, Clarizen Ingestion, User Profile Sync |
| 2   | 2026-08-03 | Akhil (SRE Observability) | Configure New Synthetic Monitoring Endpoints & Parallel Validation             | sent           | 2026-08-05   | 9 IntegrationMonitor + 27 TaskAPI endpoints; run parallel 24h then decommission old                                                |
| 1   | 2026-08-03 | Akhil (SRE Observability) | Configure New Synthetic Monitoring Endpoints & Parallel Validation             | sent           | 2026-08-05   | Original email; 9 IntegrationMonitor + 27 TaskAPI endpoints; run parallel 24h then decommission old                                |


---

## Drafts

### Email #5 — Akhil (Follow-up: Synthetic Monitoring Setup Status) — ✅ SENT

**To:** Akhil (SRE Observability)
**Subject:** Follow-up: New Synthetic Monitoring Endpoints — Setup & Validation Status

---

Hi Akhil,

Following up on the new synthetic monitoring endpoints I shared earlier this week. I wanted to check on the status of the configuration and validation:

**Quick Status Check:**
1. Have the new endpoints been configured in the observability stack?
   - 9 IntegrationMonitor endpoints (Connectivity Checks)
   - 27 TaskAPI endpoints (SnapLogic Job Checks)

2. If configured, are they working as expected?
   - Are the metrics being collected correctly?
   - Any anomalies or issues observed during the parallel validation run?

3. Timeline for decommissioning the old synthetic endpoints?

I know we discussed running both old and new endpoints in parallel for 24 hours to compare results. If that validation is complete, I'd like to understand the findings so we can proceed with the cutover plan.

Let me know if you need any additional details on the new endpoints or if there are any blockers on your end.

Thanks,
Arun

---

### Email #6 — Vaishnavi Suyog (Code Review Approval & Implementation Timeline) — ✅ SENT

**To:** Vaishnavi Suyog
**Subject:** RE: Code Review Approval — INT0002_SUB02_GCP_User_Create_Update_Docebo_Batch

---

Hi Vaishnavi,

Thanks for addressing the code review comments. Before I provide my approval for this week's release, I'd like to confirm the implementation timeline for the full scope of changes.

**Current Status:**
The changes for **INT0002_SUB02_GCP_User_Create_Update_Docebo_Batch** look good for this week's release. However, the complete review comments require standardization updates across all four pipelines:

1. INT0002_GCP_User_Create_Update_Docebo_Batch
2. INT0002_SUB01_GCP_Migration_User_Create_Update_Docebo_Batch
3. INT0002_SUB02_GCP_User_Create_Update_Docebo_Batch
4. INT0002_SUB03_GCP_User_Update_Docebo_Batch

**Required Changes:**
- Standardize variable naming convention to camelCase across all pipelines
- Add `Key_Tracking_ID` field for enhanced observability and debugging

**What I Need:**
Could you please confirm the ETA for implementing these standardization updates across all four pipelines post this week's release? Once I have that confirmation, I'll provide my approval for the current release.

Let me know if you have any questions or need clarification on the requirements.

Thanks,
Arun

---
### Email #4 — Pradip Rawat (Guidance on Infusion Automation)
**To:** Pradip Rawat
**Subject:** Guidance Needed: Automating Infusion in SnapLogic Cert Renewal Process

---

Hi Pradip,

I've documented the SnapLogic Certificate Renewal Process and am looking to automate key parts of it to reduce manual effort and improve consistency. I'd like to seek your guidance on the **Infusion component** of the process.

**Context:**
- I've created a comprehensive runbook: https://docs.google.com/document/d/1ZDFh-144qqZ9bPexgBbIJkg19IkDj416/edit#heading=h.7lpyanuuzzrp
- We're planning to automate the remaining steps using shell scripts or Ansible internally
- The Infusion part requires external coordination, so I wanted to explore automation possibilities with you

**Questions:**
1. Are there any APIs or automation hooks available in Infusion for certificate renewal workflows?
2. What's the typical process for integrating external automation tools with Infusion?
3. Are there any constraints or prerequisites we should be aware of?

I'm flexible on timing — I can discuss this later today or tomorrow based on your availability and my bandwidth. Please let me know what works best for you.

Thanks,
Arun

---

### Email #2 — Director (H1 FY27 Enhancement Summary)

**To:** [Director Name]
**Subject:** H1 FY27 Enhancement Summary — LMS Integration Platform (5 Major Initiatives)

---

Hi [Director],

I wanted to share a comprehensive summary of the LMS integration platform enhancements completed during H1 FY27. This work spans **5 major initiatives** across **22 JIRA tickets**, with 3 successfully deployed to production and 2 in final stages of completion.

---

## LMS Integration Enhancements — Complete Overview

### 1. **Demostack Partner User Logic** (May 11–14, 2026) ✅ DEPLOYED

- **Parent Story:** SNAPLOGIC-648
- **Change Request:** CHG0132021
- **Objective:** Implement logic to skip Demostack deprovisioning for Salesforce 'Partner' users
- **Impact:** Prevents accidental removal of partner account data during routine deprovisioning cycles
- **Pipeline:** `INT0002_Demostack_User_Deprovision_Docebo_Batch`
- **Status:** Deployed to production; zero incidents
- **Supporting Tasks:** 5 tickets (Naming convention check, Unit testing, Peer review, 2x Production migrations)

### 2. **Demostack Parameter Refactoring** (May 27–Jun 11, 2026) ✅ DEPLOYED

- **Parent Story:** SNAPLOGIC-781
- **Change Request:** CHG0136491
- **Objective:** Standardize all pipeline parameters to camelCase naming convention per code review feedback
- **Impact:** Improved code consistency and maintainability across Demostack pipelines
- **Pipelines:** 3 integrated pipelines
  - `INT0002_Demostack_User_Deprovision_Docebo_Batch`
  - `INT0002_SUB01_Demostack_DeprovisionCourse_Delete_Docebo_Batch`
  - `INT0002_SUB02_Demostack_DeprovisionEnrollment_Delete_Docebo_Batch`
- **Status:** Deployed to production; rapid iteration (2 weeks from review feedback to deployment)
- **Supporting Tasks:** 3 tickets (Unit testing re-run, Peer review re-run, Production migration)

### 3. **Accredible Integration — Unit 42 Course Completion Sync** (Jun 24–Jul 9, 2026) ✅ DEPLOYED

- **Parent Story:** SNAPLOGIC-924
- **Change Request:** CHG0141283
- **Objective:** Automate Unit 42 course completion syncing from Docebo to Accredible
- **Impact:** Real-time credential updates for course completions; eliminates manual sync processes
- **Pipeline:** `INT0001_Docebo_Credential_Upsert_Accredible_RealTime`
- **Status:** Deployed to production; pending final sign-off
- **Supporting Tasks:** 4 tickets (Naming convention check, Unit testing, Peer review, Production migration)

### 4. **Clarizen Data Ingestion — Pub/Sub Integration** (Jul 31–Aug 3, 2026) ⏳ IN PROGRESS

- **Parent Story:** SNAPLOGIC-1182
- **Objective:** Create SnapLogic pipeline to ingest Clarizen data and publish to GCP Pub/Sub topic `lms.clarizen.ingest`
- **Impact:** Enables downstream systems to consume Clarizen data in real-time
- **Pipeline:** Publish to GCP PubSub - `lms.clarizen.ingest`
- **Status:** Logging framework complete; pipeline development ongoing
- **Supporting Tasks:** 1 ticket (New logging framework — Done)

### 5. **User Profile Sync — SFDC Account ID to TLC** (Aug 3–6, 2026) ⏳ IN PROGRESS

- **Parent Story:** SNAPLOGIC-1188
- **Objective:** Sync SFDC Account ID to TLC User Profile for Partner-Type Users
- **Impact:** Enables proper account linkage in the learning platform for partner users
- **Pipeline:** `INT0002_SUB02_GCP_User_Create_Update_Docebo_Batch`
- **Target Prod Deployment:** Aug 6, 2026
- **Status:** Awaiting final peer review (1 review item flagged as delayed)
- **Supporting Tasks:** 4 tickets (New logging framework, Naming convention check, Unit testing, Peer review)

---

## Summary Metrics


| Metric                                  | Count                           |
| --------------------------------------- | ------------------------------- |
| **Total JIRA Tickets**                  | 22                              |
| **Parent Stories**                      | 5                               |
| **Completed (Done)**                    | 10                              |
| **In Review (Reviewed)**                | 6                               |
| **In Progress (To Do)**                 | 5                               |
| **Delayed**                             | 1                               |
| **Production Change Requests Deployed** | 3                               |
| **Unique Pipelines Enhanced/Created**   | 6                               |
| **Timeline**                            | May 11 – Aug 6, 2026 (4 months) |


---

## Key Achievements

- **Zero production incidents** across all 3 deployed enhancements
- **Full CoE compliance** — All enhancements followed standardized workflow (naming convention → unit testing → peer review → production migration)
- **Rapid iteration** — Demostack refactoring completed within 2 weeks of initial review feedback
- **Cross-system integration** — Successfully integrated Docebo, Accredible, Clarizen, and GCP Pub/Sub
- **Automation-first approach** — All enhancements automated via SnapLogic, reducing manual effort and human error

---

## Next Steps

- **User Profile Sync (SNAPLOGIC-1188):** Completing final peer review; on track for Aug 6 production deployment
- **Clarizen Ingestion (SNAPLOGIC-1182):** Pipeline development in progress; expected completion by mid-August

I'm happy to discuss any of these initiatives in more detail or provide additional technical documentation as needed.

Thanks,
Arun

---

## Drafts

<!-- Active drafts are stored below. Once sent, they move to the log above. -->

### Email #3 — Pradip Rawat (Guidance on Infusion Automation)

**To:** Pradip Rawat
**Subject:** Guidance Needed: Automating Infusion in SnapLogic Cert Renewal Process

---

Hi Pradip,

I'm working on automating the SnapLogic Certificate Renewal Process and would appreciate your guidance on a specific component.

I've documented the current cert renewal workflow here: [SnapLogic Cert Renewal Process](https://docs.google.com/document/d/1ZDFh-144qqZ9bPexgBbIJkg19IkDj416/edit#heading=h.7lpyanuuzzrp)

**Current Status:**
- Most of the renewal process can be automated using shell scripts or Ansible
- However, the **Infusion part** requires specialized knowledge that I'd like to tap into

**What I'm seeking:**
Could you provide guidance on the possibilities and best practices for automating the Infusion component? Specifically:
- What are the automation options available?
- Are there any constraints or dependencies we should be aware of?
- What's the recommended approach for integrating Infusion automation into our cert renewal workflow?

Once I have your input on the Infusion piece, I can work with the team internally to finalize the automation strategy for the remaining components (shell/Ansible).

Would you have time for a quick sync, or can you share your thoughts via email? I'm flexible on timing.

Thanks for your help!

Arun

---

### Email #8 — [Team/Sender] (INC2271589 — SnapLogic Pipeline Failure Analysis)

**To:** [Team/Sender]
**Subject:** INC2271589 Investigation — SnapLogic Platform Pipeline Failure Analysis (June 25–26, 2024)

---

Hi [Name],

As part of the investigation into **INC2271589**, I ran our agentic pipeline analysis across the SnapLogic platform for the incident window. Below is a comprehensive summary of the findings.

---

**Executive Summary:**

| Metric | Value |
|--------|-------|
| Analysis Period | 2024-06-25 to 2024-06-26 |
| Total Executions Analyzed | 1,506 |
| Total Failures (Critical) | 10 (all P2 severity) |
| Total Degraded Executions | 49 |
| Healthy Executions | 1,447 (96.1%) |
| SLA Breaches | 10 |
| Affected Pipelines | 7 of 9 monitored |
| Platform | GROUNDPLEX-PROD-GCP (8 nodes affected) |

---

**Critical Failures (10 — PIPELINE_FAILURE, P2):**

| Pipeline | Failures | Root Cause |
|----------|----------|------------|
| Email Test | 3 | `SnapCcException: Not starting pipeline as pipeline has prepare error` — Asset does not exist: `PaloAltoNetworks-Prod/shared/paloalto no reply` |
| SF_JIRADC_UNLINK | 3 | Salesforce Update error: `NOT_FOUND — Provided external ID field does not exist or is not accessible: null` |
| GCS_Error_Pipeline | 2 | Child pipeline execution failure: `Pipeline did not complete successfully` (empty snap errors) |
| Link_SFDC_Case_To_SNOW | 2 | Child pipeline execution failure: `Pipeline did not complete successfully` (empty snap errors) |

---

**Degraded Executions (49 — Completed with Errors):**

| Pipeline | Error Count | Error Type | Root Cause |
|----------|-------------|------------|------------|
| SF_JIRADC_Update_PE | 28 | HTTP 401 Unauthorized | `[Get Owner Id] Failed to execute request — Got response 401 from the endpoint` |
| SF_JiraDC_Create_Issue | 18 | HTTP 401 Unauthorized | `[Get Reporter Id] Failed to execute request — Got response 401 from the endpoint` |
| SFDC_TO_SNOW_Incident_Creation | 3 | Mixed | Salesforce `ConcurrentRequests Limit exceeded (REQUEST_LIMIT_EXCEEDED)` / ServiceNow `502 Bad Gateway` |

---

**SLA Compliance:**

| Pipeline | Total Executions | SLA Compliance | Avg Duration | P95 Duration | Error Docs |
|----------|-----------------|----------------|--------------|--------------|-----------|
| Link_SFDC_Case_To_SNOW | 11 | 81.82% | 3.18s | 9s | 4 |
| GCS_Error_Pipeline | 937 | 99.79% | 4.8s | 12s | 0 |
| SFDC_TO_SNOW_Incident_Creation | 462 | 100% | 7.1s | 10s | 4 |
| SF_JiraDC_Create_Issue | 22 | 100% | 29.45s | 36s | 18 |
| SF_JIRADC_Update_PE | 55 | 100% | 18.36s | 35s | 28 |
| Email Test | 3 | 0% (all failed) | — | — | — |
| SF_JIRADC_UNLINK | 3 | 0% (all failed) | 1s | 1s | 3 |

---

**Affected Infrastructure (Groundplex Nodes):**

| Node | Failure/Degraded Count |
|------|----------------------|
| guc1asnpjccl01p | 15 |
| guc1bsnpjccl02p | 10 |
| guw1bsnpjccl02p | 8 |
| guw1csnpjccl03p | 8 |
| guw1asnpjccl01p | 8 |
| guw1asnpjccl04p | 5 |
| guc1csnpjccl03p | 3 |
| guc1fsnpjccl04p | 2 |

All nodes reported STABLE infrastructure with LOW compute intensity and no node restarts — indicating the failures are application-layer, not infrastructure-related.

---

**Key Observations:**

1. **JIRA DC Authentication Failure (46 of 49 degraded):** The dominant issue is HTTP 401 responses from the JIRA Data Center endpoint, affecting both `SF_JIRADC_Update_PE` and `SF_JiraDC_Create_Issue`. This suggests an authentication token expiry or credential rotation issue during the incident window.

2. **Salesforce API Rate Limiting:** `SFDC_TO_SNOW_Incident_Creation` hit Salesforce's concurrent API request limit (`REQUEST_LIMIT_EXCEEDED`), indicating either a burst of simultaneous operations or insufficient API call throttling.

3. **Missing Asset Reference:** The `Email Test` pipeline consistently fails due to a missing account asset (`PaloAltoNetworks-Prod/shared/paloalto no reply`), which appears to be a configuration/deployment issue rather than a transient failure.

4. **Child Pipeline Cascading Failures:** `GCS_Error_Pipeline` and `Link_SFDC_Case_To_SNOW` failures are due to child pipeline execution failures with empty error arrays — requires deeper inspection of the invoked child pipelines.

---

**Recommended Actions:**

1. Investigate JIRA DC token/credential status during June 25–26 window (root cause for 46 errors)
2. Review Salesforce API concurrency limits and implement request throttling
3. Verify the `paloalto no reply` email account asset exists and is correctly referenced
4. Trace child pipeline failures for `GCS_Error_Pipeline` and `Link_SFDC_Case_To_SNOW`

Please let me know if you need the full execution-level export or have any questions.

Thanks,
Arun