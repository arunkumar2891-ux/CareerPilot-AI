import type {
  Job, Resume, CoverLetter, Application, Workflow, Agent,
  Document, Notification, Integration, Prompt, Automation,
  ChatConversation, DashboardMetrics, AnalyticsPoint, UserProfile,
} from '@/types';
import { uid } from '@/utils';

const COMPANIES = ['Stripe', 'Linear', 'Vercel', 'Figma', 'Notion', 'Airbnb', 'Datadog', 'Snowflake', 'Databricks', 'Anthropic', 'OpenAI', 'Ramp', 'Brex', 'Retool', 'Supabase', 'PlanetScale', 'Replit', 'Cursor', 'Perplexity', 'Glean', 'Gong', 'Loom', 'Cal.com', 'Clerk', 'Mintlify'];
const ROLES = ['Senior Frontend Engineer', 'Staff Software Engineer', 'Full-Stack Engineer', 'Product Engineer', 'Senior Product Engineer', 'Engineering Manager', 'Senior Backend Engineer', 'Platform Engineer', 'Developer Advocate', 'Staff Backend Engineer', 'Principal Engineer', 'Senior Full-Stack Engineer', 'Lead Frontend Engineer', 'AI Engineer', 'Senior AI Engineer', 'ML Engineer', 'Senior ML Engineer', 'Engineering Lead', 'Head of Engineering', 'Frontend Engineer'];
const SKILLS_POOL = ['React', 'TypeScript', 'Node.js', 'Python', 'Go', 'Rust', 'PostgreSQL', 'GraphQL', 'AWS', 'GCP', 'Kubernetes', 'Docker', 'Redis', 'Kafka', 'Next.js', 'Vite', 'Tailwind', 'Supabase', 'tRPC', 'Prisma', 'Microservices', 'System Design', 'CI/CD', 'Terraform', 'React Native', 'WebGL', 'WebAssembly', 'Vector Databases', 'LLMs', 'RAG', 'PyTorch', 'TensorFlow'];
const LOCATIONS = ['San Francisco, CA', 'New York, NY', 'Remote (US)', 'Remote (Global)', 'Austin, TX', 'Seattle, WA', 'London, UK', 'Berlin, DE', 'Toronto, CA', 'Remote (EU)'];
const SOURCES = ['LinkedIn', 'Indeed', 'Glassdoor', 'AngelList', 'Wellfound', 'Company Site', 'Remotive', 'Dice'];

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomItems<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString();
}

function hoursAgo(n: number): string {
  return new Date(Date.now() - n * 3600000).toISOString();
}

function minsAgo(n: number): string {
  return new Date(Date.now() - n * 60000).toISOString();
}

// ---- Jobs ----
export const seedJobs: Job[] = Array.from({ length: 30 }, (_, i) => {
  const company = COMPANIES[i % COMPANIES.length];
  const role = ROLES[i % ROLES.length];
  const salaryMin = 120000 + Math.floor(Math.random() * 80000);
  const statuses: Job['status'][] = ['discovered', 'queued', 'resume_ready', 'applied', 'interview', 'rejected', 'offer'];
  const appStatuses: Job['applicationStatus'][] = ['draft', 'submitted', 'viewed', 'interview', 'rejected', 'offer', 'withdrawn'];
  const statusIdx = Math.floor(Math.random() * 7);
  return {
    id: uid('job'),
    company,
    role,
    description: `We're looking for a ${role} to join the ${company} engineering team. You'll build and scale products used by millions, collaborate cross-functionally, and ship high-impact features. Ideal candidates have strong fundamentals, product sense, and a bias for action.`,
    matchScore: 60 + Math.floor(Math.random() * 40),
    salaryMin,
    salaryMax: salaryMin + 40000 + Math.floor(Math.random() * 60000),
    skills: randomItems(SKILLS_POOL, 5 + Math.floor(Math.random() * 4)),
    postingDate: daysAgo(Math.floor(Math.random() * 14)),
    source: randomFrom(SOURCES),
    location: randomFrom(LOCATIONS),
    remote: Math.random() > 0.5,
    hybrid: Math.random() > 0.6,
    experience: randomFrom(['Mid', 'Senior', 'Staff', 'Lead']),
    duplicate: Math.random() < 0.08,
    resumeStatus: randomFrom(['none', 'generating', 'ready']),
    applicationStatus: appStatuses[statusIdx],
    status: statuses[statusIdx],
    url: `https://${company.toLowerCase().replace(/[^a-z]/g, '')}.com/careers`,
    createdAt: daysAgo(Math.floor(Math.random() * 14)),
  };
});

// ---- Resumes ----
const resumeContent = (name: string, type: string) => `# ${name}

## Summary
Senior software engineer with 8+ years building scalable web applications. Specialized in ${type} roles with deep expertise in React, TypeScript, and distributed systems.

## Experience
### Senior Software Engineer — Acme Corp (2021 - Present)
- Led migration to microservices, reducing latency by 40%
- Architected real-time collaboration features used by 2M+ users
- Mentored 5 engineers, established frontend standards

### Software Engineer — Beta Inc (2018 - 2021)
- Built design system adopted across 12 product teams
- Shipped React-based dashboard handling 10k concurrent users

## Skills
React, TypeScript, Node.js, PostgreSQL, AWS, GraphQL, Kubernetes, System Design

## Education
B.S. Computer Science — University of Technology`;

export const seedResumes: Resume[] = [
  {
    id: uid('res'),
    name: 'Senior Frontend Resume',
    type: 'technical',
    content: resumeContent('Senior Frontend Resume', 'technical'),
    atsScore: 92,
    versions: [
      { id: uid('rv'), resumeId: '', version: 1, content: resumeContent('Senior Frontend Resume v1', 'technical'), atsScore: 78, createdAt: daysAgo(10), note: 'Initial draft' },
      { id: uid('rv'), resumeId: '', version: 2, content: resumeContent('Senior Frontend Resume v2', 'technical'), atsScore: 85, createdAt: daysAgo(5), note: 'Added metrics' },
      { id: uid('rv'), resumeId: '', version: 3, content: resumeContent('Senior Frontend Resume', 'technical'), atsScore: 92, createdAt: daysAgo(1), note: 'ATS-optimized' },
    ],
    createdAt: daysAgo(10),
    updatedAt: daysAgo(1),
  },
  {
    id: uid('res'),
    name: 'Executive Resume',
    type: 'executive',
    content: resumeContent('Executive Resume', 'executive'),
    atsScore: 88,
    versions: [
      { id: uid('rv'), resumeId: '', version: 1, content: resumeContent('Executive Resume v1', 'executive'), atsScore: 80, createdAt: daysAgo(8) },
      { id: uid('rv'), resumeId: '', version: 2, content: resumeContent('Executive Resume', 'executive'), atsScore: 88, createdAt: daysAgo(3) },
    ],
    createdAt: daysAgo(8),
    updatedAt: daysAgo(3),
  },
  {
    id: uid('res'),
    name: 'Full-Stack Resume',
    type: 'general',
    content: resumeContent('Full-Stack Resume', 'general'),
    atsScore: 84,
    versions: [
      { id: uid('rv'), resumeId: '', version: 1, content: resumeContent('Full-Stack Resume', 'general'), atsScore: 84, createdAt: daysAgo(6) },
    ],
    createdAt: daysAgo(6),
    updatedAt: daysAgo(6),
  },
  {
    id: uid('res'),
    name: 'AI/ML Engineer Resume',
    type: 'technical',
    content: resumeContent('AI/ML Engineer Resume', 'technical'),
    atsScore: 90,
    versions: [
      { id: uid('rv'), resumeId: '', version: 1, content: resumeContent('AI/ML Engineer Resume v1', 'technical'), atsScore: 75, createdAt: daysAgo(12) },
      { id: uid('rv'), resumeId: '', version: 2, content: resumeContent('AI/ML Engineer Resume', 'technical'), atsScore: 90, createdAt: daysAgo(2) },
    ],
    createdAt: daysAgo(12),
    updatedAt: daysAgo(2),
  },
  {
    id: uid('res'),
    name: 'Product Engineer Resume',
    type: 'creative',
    content: resumeContent('Product Engineer Resume', 'creative'),
    atsScore: 86,
    versions: [
      { id: uid('rv'), resumeId: '', version: 1, content: resumeContent('Product Engineer Resume', 'creative'), atsScore: 86, createdAt: daysAgo(4) },
    ],
    createdAt: daysAgo(4),
    updatedAt: daysAgo(4),
  },
];

// ---- Cover Letters ----
const coverLetterContent = (company: string, role: string) => `Dear Hiring Manager,

I'm excited to apply for the ${role} role at ${company}. With 8+ years building products at scale, I'm drawn to ${company}'s mission and the opportunity to contribute to your engineering culture.

In my current role, I led a team that shipped a real-time collaboration platform serving 2M+ users. I'm confident my experience in React, TypeScript, and distributed systems maps directly to the challenges you're solving.

I'd welcome the opportunity to discuss how I can contribute.

Best regards,
Alex Morgan`;

export const seedCoverLetters: CoverLetter[] = seedJobs.slice(0, 8).map((job, i) => ({
  id: uid('cl'),
  name: `Cover Letter — ${job.company}`,
  jobId: job.id,
  companyName: job.company,
  role: job.role,
  content: coverLetterContent(job.company, job.role),
  versions: [
    { id: uid('clv'), version: 1, content: coverLetterContent(job.company, job.role), createdAt: daysAgo(7 - i) },
  ],
  createdAt: daysAgo(7 - i),
  updatedAt: daysAgo(7 - i),
}));

// ---- Applications ----
export const seedApplications: Application[] = Array.from({ length: 20 }, (_, i) => {
  const job = seedJobs[i % seedJobs.length];
  const statuses: Application['status'][] = ['submitted', 'viewed', 'interview', 'offer', 'rejected', 'withdrawn', 'draft'];
  const status = statuses[i % statuses.length];
  const events: Application['timeline'] = [
    { id: uid('ev'), type: 'submitted', label: 'Application Submitted', date: daysAgo(10 - (i % 10)) },
  ];
  if (status === 'viewed' || status === 'interview' || status === 'offer' || status === 'rejected') {
    events.push({ id: uid('ev'), type: 'viewed', label: 'Viewed by Recruiter', date: daysAgo(7 - (i % 7)) });
  }
  if (status === 'interview' || status === 'offer') {
    events.push({ id: uid('ev'), type: 'interview', label: 'Phone Screen', date: daysAgo(5 - (i % 5)), description: '45 min technical screen with hiring manager' });
  }
  if (status === 'offer') {
    events.push({ id: uid('ev'), type: 'offer', label: 'Offer Extended', date: daysAgo(2), description: 'Base $215k + equity' });
  }
  if (status === 'rejected') {
    events.push({ id: uid('ev'), type: 'rejected', label: 'Rejected', date: daysAgo(3), description: 'Went with another candidate' });
  }
  return {
    id: uid('app'),
    jobId: job.id,
    company: job.company,
    role: job.role,
    resumeVersionId: seedResumes[i % seedResumes.length].versions[0].id,
    coverLetterId: i < seedCoverLetters.length ? seedCoverLetters[i].id : undefined,
    applicationDate: daysAgo(10 - (i % 10)),
    recruiter: i % 3 === 0 ? randomFrom(['Sarah Chen', 'Mike Ross', 'Priya Patel']) : undefined,
    status,
    timeline: events,
    notes: i % 4 === 0 ? 'Strong referral from internal contact. Follow up next week.' : '',
    attachments: i % 2 === 0 ? ['resume_v3.pdf', 'cover_letter.pdf'] : ['resume_v3.pdf'],
    createdAt: daysAgo(10 - (i % 10)),
  };
});

// ---- Workflows ----
const wfTemplates = [
  { name: 'Daily Job Discovery', desc: 'Scrapes LinkedIn & Indeed for matching jobs every morning', nodes: ['schedule', 'job_search', 'duplicate_checker', 'supabase', 'notification'] },
  { name: 'Auto Resume Tailoring', desc: 'Tailors resume to each new high-match job', nodes: ['webhook', 'gemini', 'resume_optimizer', 'supabase', 'pdf'] },
  { name: 'Application Tracker Sync', desc: 'Syncs applications to Notion and Google Sheets', nodes: ['schedule', 'supabase', 'http', 'gdocs', 'notification'] },
  { name: 'Interview Prep Generator', desc: 'Generates interview prep from job description', nodes: ['webhook', 'claude', 'prompt', 'storage'] },
  { name: 'Cover Letter Automation', desc: 'Auto-generates cover letters for new applications', nodes: ['trigger', 'openai', 'cover_letter', 'pdf', 'email'] },
  { name: 'LinkedIn Job Scraper', desc: 'Apify-powered LinkedIn scraper with dedup', nodes: ['schedule', 'apify', 'linkedin', 'duplicate_checker', 'supabase'] },
  { name: 'Weekly Analytics Report', desc: 'Compiles weekly job search analytics', nodes: ['schedule', 'supabase', 'transform', 'gemini', 'email'] },
  { name: 'Salary Research Bot', desc: 'Researches salary ranges for matched roles', nodes: ['trigger', 'http', 'openai', 'supabase', 'notification'] },
  { name: 'Recruiter Outreach', desc: 'Drafts personalized recruiter emails', nodes: ['webhook', 'claude', 'email', 'supabase'] },
  { name: 'ATS Score Monitor', desc: 'Re-checks ATS scores on resume updates', nodes: ['trigger', 'resume_optimizer', 'supabase', 'notification'] },
  { name: 'Application Reminder Flow', desc: 'Sends reminders for stale applications', nodes: ['schedule', 'supabase', 'condition', 'notification', 'email'] },
  { name: 'Knowledge Base Indexer', desc: 'Chunks and embeds new documents for RAG', nodes: ['trigger', 'storage', 'function', 'supabase', 'gemini'] },
];

export const seedWorkflows: Workflow[] = wfTemplates.map((t, i) => {
  const nodes = t.nodes.map((type, idx) => ({
    id: `n_${i}_${idx}`,
    type: type as Workflow['nodes'][number]['type'],
    name: type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    position: { x: 120 + idx * 200, y: 80 + (idx % 2) * 120 },
    config: {},
    status: 'idle' as const,
  }));
  const edges = nodes.slice(0, -1).map((n, idx) => ({
    id: `e_${i}_${idx}`,
    source: n.id,
    target: nodes[idx + 1].id,
  }));
  const runs: Workflow['runs'] = Array.from({ length: 2 + (i % 3) }, (_, r) => {
    const failed = r === 0 && i % 4 === 0;
    const status: Workflow['runs'][number]['status'] = failed ? 'failed' : 'success';
    return {
      id: uid('run'),
      workflowId: '',
      status,
      startedAt: daysAgo(r + 1),
      finishedAt: daysAgo(r + 1),
      duration: 1200 + Math.floor(Math.random() * 8000),
      nodeResults: nodes.map((n) => ({ nodeId: n.id, status, duration: 200 + Math.floor(Math.random() * 1000) })),
      logs: [
        { id: uid('log'), level: 'info', message: `Workflow ${t.name} started`, timestamp: daysAgo(r + 1), nodeId: nodes[0]?.id },
        { id: uid('log'), level: failed ? 'error' : 'info', message: failed ? 'Node failed: timeout exceeded' : 'Workflow completed successfully', timestamp: daysAgo(r + 1) },
      ],
    };
  });
  return {
    id: uid('wf'),
    name: t.name,
    description: t.desc,
    active: i % 3 !== 0,
    nodes,
    edges,
    schedule: i % 2 === 0 ? '0 9 * * *' : '*/6 * * * *',
    lastRun: daysAgo(i % 5),
    nextRun: hoursAgo(-24 + (i % 12)),
    runs,
    createdAt: daysAgo(20 - i),
    updatedAt: daysAgo(i % 7),
  };
});

// ---- Agents ----
const agentTemplates = [
  { name: 'Resume Optimizer', type: 'resume_optimizer', desc: 'Tailors and optimizes resumes for specific job descriptions', prompt: 'You are a resume optimization expert. Given a resume and job description, produce an ATS-optimized tailored resume.' },
  { name: 'ATS Analyzer', type: 'ats_analyzer', desc: 'Scores resumes against ATS criteria', prompt: 'You are an ATS scoring engine. Analyze the resume and return a score 0-100 with actionable feedback.' },
  { name: 'Job Matcher', type: 'job_matcher', desc: 'Matches jobs to candidate profile', prompt: 'You are a job matching engine. Score how well a candidate fits a job description from 0-100.' },
  { name: 'Job Ranker', type: 'job_ranker', desc: 'Ranks jobs by relevance and opportunity', prompt: 'Rank the provided jobs by match quality, salary, and growth opportunity.' },
  { name: 'Resume Formatter', type: 'resume_formatter', desc: 'Formats resumes to clean templates', prompt: 'Reformat the resume content into a clean, professional, ATS-friendly template.' },
  { name: 'Cover Letter Writer', type: 'cover_letter_writer', desc: 'Writes personalized cover letters', prompt: 'Write a concise, compelling cover letter tailored to the role and company.' },
  { name: 'Interview Coach', type: 'interview_coach', desc: 'Prepares interview answers and questions', prompt: 'You are an interview coach. Generate likely questions and strong STAR-method answers.' },
  { name: 'Career Advisor', type: 'career_advisor', desc: 'Provides strategic career guidance', prompt: 'You are a career advisor. Give strategic, actionable career guidance.' },
  { name: 'Application Reviewer', type: 'application_reviewer', desc: 'Reviews application materials for quality', prompt: 'Review the application materials and flag issues, gaps, and improvements.' },
  { name: 'Email Composer', type: 'email_composer', desc: 'Drafts professional outreach emails', prompt: 'Compose a concise, professional email for the given context.' },
  { name: 'Salary Negotiator', type: 'career_advisor', desc: 'Coaches salary negotiation', prompt: 'You are a salary negotiation coach. Provide scripts and strategy for negotiating an offer.' },
  { name: 'LinkedIn Optimizer', type: 'resume_optimizer', desc: 'Optimizes LinkedIn profile sections', prompt: 'Optimize the LinkedIn profile sections for recruiter discoverability.' },
  { name: 'Portfolio Summarizer', type: 'application_reviewer', desc: 'Summarizes portfolio projects', prompt: 'Summarize portfolio projects into crisp, impact-driven bullet points.' },
  { name: 'JD Explainer', type: 'career_advisor', desc: 'Decodes job descriptions', prompt: 'Break down the job description: must-haves, nice-to-haves, red flags, and talking points.' },
  { name: 'Referral Requester', type: 'email_composer', desc: 'Drafts referral request messages', prompt: 'Draft a warm, concise referral request message for the target role.' },
];

export const seedAgents: Agent[] = agentTemplates.map((a, i) => {
  const providers = ['gemini', 'openai', 'claude'] as const;
  return {
    id: uid('agent'),
    name: a.name,
    type: a.type as Agent['type'],
    description: a.desc,
    prompt: a.prompt,
    model: providers[i % 3],
    temperature: 0.3 + (i % 5) * 0.15,
    memory: i % 2 === 0,
    enabled: i % 4 !== 0,
    runs: Array.from({ length: 3 + (i % 4) }, (_, r) => ({
      id: uid('arun'),
      agentId: '',
      status: r === 0 && i % 5 === 0 ? 'failed' : 'success',
      input: 'Sample input for ' + a.name,
      output: 'Generated output from ' + a.name + ' run #' + (r + 1),
      startedAt: daysAgo(r + 1),
      duration: 800 + Math.floor(Math.random() * 4000),
      cost: 0.002 + Math.random() * 0.05,
      tokens: 500 + Math.floor(Math.random() * 3000),
    })),
    metrics: {
      runs: 20 + i * 3,
      successRate: 85 + (i % 15),
      avgLatency: 1200 + i * 100,
      totalCost: 2 + i * 0.5,
      tokens: 50000 + i * 8000,
    },
    createdAt: daysAgo(15 - (i % 15)),
  };
});

// ---- Documents ----
export const seedDocuments: Document[] = [
  { id: uid('doc'), name: 'Master Resume.pdf', type: 'pdf', size: 245000, folder: 'Resumes', tags: ['master', 'ats'], content: 'Master resume content...', versions: [{ id: uid('dv'), version: 1, createdAt: daysAgo(5) }], createdAt: daysAgo(5), updatedAt: daysAgo(5) },
  { id: uid('doc'), name: 'Portfolio.pdf', type: 'pdf', size: 1800000, folder: 'Portfolio', tags: ['design', 'projects'], versions: [{ id: uid('dv'), version: 1, createdAt: daysAgo(12) }], createdAt: daysAgo(12), updatedAt: daysAgo(12) },
  { id: uid('doc'), name: 'Career Notes.md', type: 'md', size: 12000, folder: 'Notes', tags: ['strategy'], content: '# Career Strategy\n\nFocus on AI/ML roles at high-growth startups...', versions: [{ id: uid('dv'), version: 1, createdAt: daysAgo(8) }, { id: uid('dv'), version: 2, createdAt: daysAgo(2) }], createdAt: daysAgo(8), updatedAt: daysAgo(2) },
  { id: uid('doc'), name: 'Interview Prep.txt', type: 'txt', size: 8000, folder: 'Notes', tags: ['interview'], content: 'System design notes...', versions: [{ id: uid('dv'), version: 1, createdAt: daysAgo(6) }], createdAt: daysAgo(6), updatedAt: daysAgo(6) },
  { id: uid('doc'), name: 'Offer Comparison.docx', type: 'docx', size: 45000, folder: 'Offers', tags: ['offer', 'negotiation'], versions: [{ id: uid('dv'), version: 1, createdAt: daysAgo(3) }], createdAt: daysAgo(3), updatedAt: daysAgo(3) },
  { id: uid('doc'), name: 'Profile Photo.png', type: 'image', size: 320000, folder: 'Assets', tags: ['avatar'], versions: [{ id: uid('dv'), version: 1, createdAt: daysAgo(20) }], createdAt: daysAgo(20), updatedAt: daysAgo(20) },
];

// ---- Notifications ----
export const seedNotifications: Notification[] = [
  { id: uid('ntf'), type: 'in_app', title: '12 new jobs found', message: 'Your daily job discovery found 12 new matching positions.', read: false, createdAt: minsAgo(15) },
  { id: uid('ntf'), type: 'reminder', title: 'Application due tomorrow', message: 'Stripe Senior Frontend Engineer application deadline is tomorrow.', read: false, createdAt: hoursAgo(2) },
  { id: uid('ntf'), type: 'failure', title: 'Workflow failed', message: 'Auto Resume Tailoring failed at the Gemini node. Check logs.', read: false, createdAt: hoursAgo(5) },
  { id: uid('ntf'), type: 'summary', title: 'Daily summary ready', message: 'You found 12 jobs, submitted 3 applications, and 1 interview scheduled today.', read: true, createdAt: hoursAgo(8) },
  { id: uid('ntf'), type: 'reminder', title: 'Interview scheduled', message: 'Phone screen with Linear on Thursday at 2pm PT.', read: true, createdAt: daysAgo(1) },
  { id: uid('ntf'), type: 'in_app', title: 'Resume ATS score improved', message: 'Your Senior Frontend Resume is now scoring 92/100.', read: true, createdAt: daysAgo(1) },
];

// ---- Integrations ----
export const seedIntegrations: Integration[] = [
  { id: uid('int'), name: 'Google Drive', category: 'Storage', status: 'connected', description: 'Sync documents and resumes to Google Drive', icon: 'drive', lastSync: hoursAgo(3), logs: [{ id: uid('log'), message: 'Synced 24 files', level: 'info', timestamp: hoursAgo(3) }] },
  { id: uid('int'), name: 'Google Docs', category: 'Productivity', status: 'connected', description: 'Export and edit documents in Google Docs', icon: 'docs', lastSync: hoursAgo(6), logs: [{ id: uid('log'), message: 'Exported 3 cover letters', level: 'info', timestamp: hoursAgo(6) }] },
  { id: uid('int'), name: 'LinkedIn', category: 'Job Boards', status: 'connected', description: 'Scrape jobs and sync profile', icon: 'linkedin', lastSync: minsAgo(30), logs: [{ id: uid('log'), message: 'Found 47 jobs', level: 'info', timestamp: minsAgo(30) }] },
  { id: uid('int'), name: 'Apify', category: 'Automation', status: 'connected', description: 'Run scrapers and data collection actors', icon: 'apify', lastSync: hoursAgo(1), logs: [{ id: uid('log'), message: 'Actor run completed', level: 'info', timestamp: hoursAgo(1) }] },
  { id: uid('int'), name: 'Supabase', category: 'Database', status: 'connected', description: 'Primary database and auth provider', icon: 'supabase', lastSync: minsAgo(1), logs: [{ id: uid('log'), message: 'Connection healthy', level: 'info', timestamp: minsAgo(1) }] },
  { id: uid('int'), name: 'Gemini', category: 'AI Provider', status: 'connected', description: 'Google Gemini AI models', icon: 'gemini', lastSync: minsAgo(5), logs: [{ id: uid('log'), message: '12 completions today', level: 'info', timestamp: minsAgo(5) }] },
  { id: uid('int'), name: 'OpenAI', category: 'AI Provider', status: 'connected', description: 'GPT-4o and GPT-4 models', icon: 'openai', lastSync: minsAgo(10), logs: [{ id: uid('log'), message: '8 completions today', level: 'info', timestamp: minsAgo(10) }] },
  { id: uid('int'), name: 'Claude', category: 'AI Provider', status: 'connected', description: 'Anthropic Claude models', icon: 'claude', lastSync: minsAgo(20), logs: [{ id: uid('log'), message: '5 completions today', level: 'info', timestamp: minsAgo(20) }] },
  { id: uid('int'), name: 'Anthropic', category: 'AI Provider', status: 'connected', description: 'Anthropic API access', icon: 'anthropic', lastSync: minsAgo(20), logs: [] },
  { id: uid('int'), name: 'Gmail', category: 'Email', status: 'connected', description: 'Send and receive email via Gmail', icon: 'gmail', lastSync: hoursAgo(2), logs: [{ id: uid('log'), message: 'Sent 4 outreach emails', level: 'info', timestamp: hoursAgo(2) }] },
  { id: uid('int'), name: 'Outlook', category: 'Email', status: 'disconnected', description: 'Microsoft Outlook email integration', icon: 'outlook', logs: [] },
  { id: uid('int'), name: 'SMTP', category: 'Email', status: 'disconnected', description: 'Custom SMTP server for email', icon: 'smtp', logs: [] },
  { id: uid('int'), name: 'GitHub', category: 'Developer', status: 'connected', description: 'Sync repos and contributions', icon: 'github', lastSync: hoursAgo(4), logs: [{ id: uid('log'), message: 'Synced 3 repos', level: 'info', timestamp: hoursAgo(4) }] },
  { id: uid('int'), name: 'Notion', category: 'Productivity', status: 'connected', description: 'Sync applications and notes to Notion', icon: 'notion', lastSync: hoursAgo(7), logs: [{ id: uid('log'), message: 'Synced 20 applications', level: 'info', timestamp: hoursAgo(7) }] },
  { id: uid('int'), name: 'Slack', category: 'Notifications', status: 'connected', description: 'Send notifications to Slack channels', icon: 'slack', lastSync: minsAgo(45), logs: [{ id: uid('log'), message: '3 notifications sent', level: 'info', timestamp: minsAgo(45) }] },
  { id: uid('int'), name: 'Webhook', category: 'Automation', status: 'connected', description: 'Incoming and outgoing webhooks', icon: 'webhook', lastSync: minsAgo(2), logs: [] },
  { id: uid('int'), name: 'REST API', category: 'Developer', status: 'connected', description: 'Public REST API access', icon: 'api', lastSync: minsAgo(1), logs: [] },
];

// ---- Prompts ----
export const seedPrompts: Prompt[] = [
  { id: uid('pmt'), name: 'Resume Tailoring', category: 'Resume', content: 'Tailor the following resume to match this job description. Highlight relevant skills and achievements. Resume: {{resume}} JD: {{jd}}', variables: ['resume', 'jd'], version: 3, history: [{ id: uid('ph'), version: 1, content: 'Tailor resume for job.', createdAt: daysAgo(15) }, { id: uid('ph'), version: 2, content: 'Tailor the resume to match the JD.', createdAt: daysAgo(8) }, { id: uid('ph'), version: 3, content: 'Tailor the following resume to match this job description. Highlight relevant skills and achievements. Resume: {{resume}} JD: {{jd}}', createdAt: daysAgo(2) }], createdAt: daysAgo(15) },
  { id: uid('pmt'), name: 'Cover Letter Generation', category: 'Cover Letter', content: 'Write a concise, compelling cover letter for {{role}} at {{company}}. Reference my experience: {{experience}}', variables: ['role', 'company', 'experience'], version: 2, history: [{ id: uid('ph'), version: 1, content: 'Write a cover letter.', createdAt: daysAgo(10) }, { id: uid('ph'), version: 2, content: 'Write a concise, compelling cover letter for {{role}} at {{company}}. Reference my experience: {{experience}}', createdAt: daysAgo(4) }], createdAt: daysAgo(10) },
  { id: uid('pmt'), name: 'Interview Question Generator', category: 'Interview', content: 'Generate 10 likely interview questions for {{role}} at {{company}}. Include behavioral and technical. JD: {{jd}}', variables: ['role', 'company', 'jd'], version: 1, history: [{ id: uid('ph'), version: 1, content: 'Generate 10 likely interview questions for {{role}} at {{company}}. Include behavioral and technical. JD: {{jd}}', createdAt: daysAgo(6) }], createdAt: daysAgo(6) },
  { id: uid('pmt'), name: 'Salary Negotiation Script', category: 'Negotiation', content: 'Create a salary negotiation script for an offer of {{offer}}. Target: {{target}}. Role: {{role}}', variables: ['offer', 'target', 'role'], version: 1, history: [{ id: uid('ph'), version: 1, content: 'Create a salary negotiation script for an offer of {{offer}}. Target: {{target}}. Role: {{role}}', createdAt: daysAgo(3) }], createdAt: daysAgo(3) },
  { id: uid('pmt'), name: 'JD Analysis', category: 'Analysis', content: 'Analyze this job description. Extract must-have skills, nice-to-haves, red flags, and talking points. JD: {{jd}}', variables: ['jd'], version: 2, history: [{ id: uid('ph'), version: 1, content: 'Analyze this JD.', createdAt: daysAgo(9) }, { id: uid('ph'), version: 2, content: 'Analyze this job description. Extract must-have skills, nice-to-haves, red flags, and talking points. JD: {{jd}}', createdAt: daysAgo(5) }], createdAt: daysAgo(9) },
  { id: uid('pmt'), name: 'Recruiter Outreach', category: 'Email', content: 'Draft a concise, warm outreach message to a recruiter at {{company}} for {{role}}. My background: {{background}}', variables: ['company', 'role', 'background'], version: 1, history: [{ id: uid('ph'), version: 1, content: 'Draft a concise, warm outreach message to a recruiter at {{company}} for {{role}}. My background: {{background}}', createdAt: daysAgo(7) }], createdAt: daysAgo(7) },
];

// ---- Automations ----
export const seedAutomations: Automation[] = seedWorkflows.slice(0, 8).map((wf, i) => ({
  id: uid('auto'),
  name: wf.name,
  workflowId: wf.id,
  status: i % 3 === 0 ? 'paused' : 'active',
  schedule: wf.schedule || '0 9 * * *',
  trigger: i % 2 === 0 ? 'Schedule' : 'Webhook',
  lastRun: wf.lastRun,
  nextRun: wf.nextRun,
  retries: i % 4 === 0 ? 2 : 0,
  versions: [{ id: uid('av'), version: 1, createdAt: daysAgo(10) }, { id: uid('av'), version: 2, createdAt: daysAgo(3) }],
  createdAt: daysAgo(15 - i),
}));

// ---- Chat conversations ----
export const seedConversations: ChatConversation[] = [
  {
    id: uid('chat'),
    title: 'Tailor resume for Stripe role',
    messages: [
      { id: uid('msg'), role: 'user', content: 'Can you tailor my Senior Frontend Resume for the Stripe Senior Frontend Engineer role?', createdAt: hoursAgo(5) },
      { id: uid('msg'), role: 'assistant', content: "I've tailored your resume to emphasize Stripe's focus on developer experience, API design, and scalable frontend systems. I highlighted your real-time collaboration work and design system experience. The ATS score improved from 84 to 93.", artifact: { type: 'resume', title: 'Tailored Resume — Stripe', content: resumeContent('Tailored Resume — Stripe', 'technical') }, createdAt: hoursAgo(5) },
    ],
    createdAt: hoursAgo(5),
    updatedAt: hoursAgo(5),
  },
  {
    id: uid('chat'),
    title: 'Interview prep for Linear',
    messages: [
      { id: uid('msg'), role: 'user', content: 'I have a phone screen with Linear tomorrow. Help me prepare.', createdAt: hoursAgo(3) },
      { id: uid('msg'), role: 'assistant', content: "Here are 8 likely questions for a Linear frontend role, focusing on performance, keyboard-first UX, and real-time sync. I've drafted STAR-method answers for each based on your background.", artifact: { type: 'analysis', title: 'Interview Prep — Linear', content: '1. Tell me about a time you optimized rendering performance...\n2. How would you design keyboard-first navigation...\n3. Describe your experience with real-time collaboration...' }, createdAt: hoursAgo(3) },
    ],
    createdAt: hoursAgo(3),
    updatedAt: hoursAgo(3),
  },
  {
    id: uid('chat'),
    title: 'Salary negotiation advice',
    messages: [
      { id: uid('msg'), role: 'user', content: 'I got an offer for $190k base. Market seems higher. How do I negotiate?', createdAt: hoursAgo(1) },
      { id: uid('msg'), role: 'assistant', content: "Based on your role and market data, $215k-$235k base is reasonable. Here's a negotiation script that anchors on market data, reaffirms enthusiasm, and requests a specific number.", createdAt: hoursAgo(1) },
    ],
    createdAt: hoursAgo(1),
    updatedAt: hoursAgo(1),
  },
];

// ---- Dashboard metrics ----
export const seedDashboardMetrics: DashboardMetrics = {
  jobsFoundToday: 12,
  jobsProcessed: 247,
  applicationsReady: 8,
  applicationsSubmitted: 34,
  resumeVersions: 18,
  aiCreditsUsed: 1240,
  successRate: 72,
  avgAtsScore: 88,
};

// ---- Analytics ----
export const seedAnalytics: AnalyticsPoint[] = Array.from({ length: 14 }, (_, i) => ({
  label: `${i + 1}d ago`,
  jobsFound: 8 + Math.floor(Math.random() * 15),
  jobsApplied: 2 + Math.floor(Math.random() * 6),
  interviewRate: 20 + Math.floor(Math.random() * 40),
  offerRate: 5 + Math.floor(Math.random() * 20),
}));

// ---- User profile ----
export const seedUserProfile: UserProfile = {
  id: uid('user'),
  email: 'alex.morgan@example.com',
  fullName: 'Alex Morgan',
  title: 'Senior Software Engineer',
  plan: 'pro',
  aiCreditsUsed: 1240,
  aiCreditsTotal: 5000,
};
