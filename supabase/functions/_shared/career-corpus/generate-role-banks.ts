import { createAdminClient } from '../supabase-admin.ts';
import { getUserSettings } from '../credentials.ts';
import { generateWithProviders } from '../ai/router.ts';
import { ROLE_PLAYBOOKS } from './data.ts';
import {
  applyContactOverlay,
  formatContact,
  playbookInstructions,
  ROLE_BANK_SYSTEM_PROMPT,
  buildRoleBankUserPrompt,
} from './prompt.ts';
import {
  buildFocusedMasterResume,
  extractMandatoryResumeSections,
  resumeBankName,
  type RolePlaybookShape,
} from './resume-bank.ts';
import { assembleSourceLockedResume } from './assemble-source-locked-resume.ts';
import { buildBulletCatalog, buildCatalogGroundingSource } from './resume-bullets.ts';
import { validateResumeOutput } from '../ai/validate-resume.ts';

const MASTER_RESUME_NAME = 'Master ATS (bullet bank)';

export type RoleBanksStatus = 'generating' | 'ready' | 'error';

function playbookShape(playbook: (typeof ROLE_PLAYBOOKS)[number]): RolePlaybookShape {
  const deemphasize = Array.isArray(playbook.deemphasize)
    ? playbook.deemphasize[0]
    : playbook.deemphasize;
  return {
    id: playbook.id,
    title: playbook.title,
    leadWith: playbook.leadWith,
    emphasize: playbook.emphasize,
    highlight: playbook.highlight,
    deemphasize,
  };
}

export async function patchJobSearchSettings(
  userId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const admin = createAdminClient();
  const settings = await getUserSettings(userId);
  const jobSearch = (settings.jobSearch as Record<string, unknown> | undefined) || {};
  await admin.from('settings').upsert({
    user_id: userId,
    data: {
      ...settings,
      jobSearch: { ...jobSearch, ...patch },
    },
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
}

export async function setRoleBanksStatus(
  userId: string,
  status: RoleBanksStatus,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await patchJobSearchSettings(userId, {
    roleBanksStatus: status,
    ...extra,
  });
}

function assembleRoleBankFallback(input: {
  contactBlock: string;
  masterContent: string;
  playbook: RolePlaybookShape;
}): string {
  const focused = buildFocusedMasterResume(input.masterContent, input.playbook);
  const catalog = buildBulletCatalog(focused || input.masterContent);
  const mandatory = extractMandatoryResumeSections(focused || input.masterContent, input.playbook.emphasize);
  return assembleSourceLockedResume({
    contactBlock: input.contactBlock,
    summarySource: mandatory.summary,
    skillsSource: mandatory.skills,
    educationSource: mandatory.education,
    certificationSource: mandatory.certification,
    rerankedBulletIds: catalog.filter((line) => line.isBullet).map((line) => line.id),
    catalog,
    maxExperienceBullets: 60,
  });
}

export async function generateRoleBankResume(input: {
  userId: string;
  playbook: RolePlaybookShape;
  masterContent: string;
  contactBlock: string;
}): Promise<{ text: string; source: 'llm' | 'fallback' }> {
  const mandatory = extractMandatoryResumeSections(input.masterContent, input.playbook.emphasize);
  const userPrompt = buildRoleBankUserPrompt({
    playbookTitle: input.playbook.title,
    playbookInstructions: playbookInstructions({
      title: input.playbook.title,
      leadWith: input.playbook.leadWith,
      emphasize: input.playbook.emphasize,
      highlight: input.playbook.highlight,
      deemphasize: input.playbook.deemphasize,
    }),
    masterResume: input.masterContent,
    contactBlock: input.contactBlock,
    skillsSource: mandatory.skills,
    educationSource: mandatory.education,
    certificationSource: mandatory.certification,
    summarySource: mandatory.summary,
  });
  const groundingSource = buildCatalogGroundingSource(buildBulletCatalog(input.masterContent), [
    input.contactBlock,
    mandatory.skills,
    mandatory.education,
    mandatory.certification,
    mandatory.summary,
  ]);

  try {
    const generated = await generateWithProviders({
      systemPrompt: ROLE_BANK_SYSTEM_PROMPT,
      userPrompt,
      operation: 'resume_tailoring',
      groundingSource,
      skillsSource: mandatory.skills,
      educationSource: mandatory.education,
      certificationSource: mandatory.certification,
      skipTwoPageShape: true,
    }, { userId: input.userId });
    return { text: generated.text, source: 'llm' };
  } catch (err) {
    console.error(
      `[role-banks] LLM generation failed for ${input.playbook.title}:`,
      err instanceof Error ? err.message : String(err),
    );
    const fallback = assembleRoleBankFallback({
      contactBlock: input.contactBlock,
      masterContent: input.masterContent,
      playbook: input.playbook,
    });
    const checked = validateResumeOutput(fallback, {
      skillsSource: mandatory.skills,
      educationSource: mandatory.education,
      certificationSource: mandatory.certification,
      skipTwoPageShape: true,
      skipGrounding: true,
    });
    if (!checked.ok) {
      throw new Error(`Role bank fallback failed validation (${checked.reason}) for ${input.playbook.title}`);
    }
    return { text: checked.text, source: 'fallback' };
  }
}

async function upsertRoleBankResume(userId: string, name: string, content: string): Promise<void> {
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from('resumes')
    .select('id')
    .eq('user_id', userId)
    .eq('name', name)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await admin.from('resumes').update({
      content,
      is_corpus: true,
      updated_at: new Date().toISOString(),
    }).eq('id', existing.id);
    if (error) throw error;
    return;
  }

  const { error } = await admin.from('resumes').insert({
    user_id: userId,
    name,
    type: 'technical',
    content,
    ats_score: 0,
    is_corpus: true,
  });
  if (error) throw error;
}

export async function generateAllRoleBanks(userId: string): Promise<{
  generated: number;
  fallback: number;
  failed: number;
}> {
  const admin = createAdminClient();
  const settings = await getUserSettings(userId);
  const { data: masterRow } = await admin
    .from('resumes')
    .select('content')
    .eq('user_id', userId)
    .eq('name', MASTER_RESUME_NAME)
    .maybeSingle();
  const masterContent = String(masterRow?.content || '').trim();
  if (masterContent.length < 500) {
    await setRoleBanksStatus(userId, 'error', {
      roleBanksError: 'Master ATS is missing or too short to generate role banks.',
    });
    return { generated: 0, fallback: 0, failed: ROLE_PLAYBOOKS.length };
  }

  const { data: profile } = await admin.from('profiles').select('full_name, title, email').eq('user_id', userId).maybeSingle();
  const stored = (settings.contact as Record<string, string> | undefined) || {};
  const contact: Record<string, string | undefined> = {
    fullName: profile?.full_name || stored.fullName,
    title: profile?.title || stored.title,
    email: stored.email || profile?.email,
    phone: stored.phone,
    location: stored.location,
    linkedin: stored.linkedin,
    github: stored.github,
    startDate: stored.startDate,
  };
  const overlayedMaster = applyContactOverlay(masterContent, contact);
  const contactBlock = formatContact(contact);

  let generated = 0;
  let fallback = 0;
  let failed = 0;

  for (const rawPlaybook of ROLE_PLAYBOOKS) {
    const playbook = playbookShape(rawPlaybook);
    const name = resumeBankName(playbook);
    try {
      const result = await generateRoleBankResume({
        userId,
        playbook,
        masterContent: overlayedMaster,
        contactBlock,
      });
      await upsertRoleBankResume(userId, name, result.text);
      if (result.source === 'llm') generated += 1;
      else fallback += 1;
    } catch (err) {
      failed += 1;
      console.error(
        `[role-banks] failed to store ${name}:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  if (generated + fallback === 0) {
    await setRoleBanksStatus(userId, 'error', {
      roleBanksError: 'All role-bank generations failed.',
      roleBanksGeneratedAt: new Date().toISOString(),
    });
  } else {
    await setRoleBanksStatus(userId, 'ready', {
      roleBanksError: failed > 0 ? `${failed} role bank(s) failed` : '',
      roleBanksGeneratedAt: new Date().toISOString(),
    });
  }

  return { generated, fallback, failed };
}

export function scheduleRoleBankGeneration(userId: string): void {
  const task = generateAllRoleBanks(userId).catch((err) => {
    console.error('[role-banks] background generation failed:', err instanceof Error ? err.message : String(err));
    return setRoleBanksStatus(userId, 'error', {
      roleBanksError: err instanceof Error ? err.message : String(err),
    });
  });
  const edgeRuntime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (edgeRuntime?.waitUntil) {
    edgeRuntime.waitUntil(task);
    return;
  }
  void task;
}
