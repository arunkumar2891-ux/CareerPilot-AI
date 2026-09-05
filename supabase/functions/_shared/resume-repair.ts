import type { createAdminClient } from './supabase-admin.ts';
import { buildTailoredResumeName } from './resume-store.ts';
import { listDrivePdfs, driveFileBaseKey, resolveResumePdfFileName } from './resume-drive.ts';

type AdminClient = ReturnType<typeof createAdminClient>;

export interface RepairSyncResult {
  resumesLinkedToJobs: number;
  jobsLinkedToResumes: number;
  driveFilesMatched: number;
  driveOnlyFiles: string[];
  jobsWithoutResume: number;
  resumesWithoutJob: number;
}

async function countResumesForJob(admin: AdminClient, jobId: string): Promise<number> {
  const { count } = await admin.from('resumes').select('id', { count: 'exact', head: true }).eq('job_id', jobId);
  return count ?? 0;
}

export async function repairResumeJobLinks(admin: AdminClient, userId: string): Promise<{
  resumesLinkedToJobs: number;
  jobsLinkedToResumes: number;
}> {
  let resumesLinkedToJobs = 0;
  let jobsLinkedToResumes = 0;

  const { data: unlinkedResumes } = await admin
    .from('resumes')
    .select('id, name')
    .eq('user_id', userId)
    .is('job_id', null)
    .like('name', 'Tailored:%');

  for (const resume of unlinkedResumes || []) {
    const { data: jobs } = await admin
      .from('jobs')
      .select('id, company, role')
      .eq('user_id', userId);

    const match = (jobs || []).find((job) => buildTailoredResumeName(String(job.company), String(job.role)) === resume.name);
    if (!match) continue;
    if (await countResumesForJob(admin, match.id) > 0) continue;

    await admin.from('resumes').update({
      job_id: match.id,
      updated_at: new Date().toISOString(),
    }).eq('id', resume.id);
    resumesLinkedToJobs++;
  }

  const { data: jobs } = await admin
    .from('jobs')
    .select('id, company, role, pdf_url')
    .eq('user_id', userId);

  for (const job of jobs || []) {
    if (await countResumesForJob(admin, job.id) > 0) continue;

    const tailoredName = buildTailoredResumeName(String(job.company), String(job.role));
    const { data: resume } = await admin
      .from('resumes')
      .select('id')
      .eq('user_id', userId)
      .eq('name', tailoredName)
      .maybeSingle();

    if (resume?.id) {
      await admin.from('resumes').update({
        job_id: job.id,
        updated_at: new Date().toISOString(),
      }).eq('id', resume.id);
      jobsLinkedToResumes++;
    }
  }

  return { resumesLinkedToJobs, jobsLinkedToResumes };
}

export async function reconcileDriveFiles(
  admin: AdminClient,
  userId: string,
  folderId: string,
): Promise<{ driveFilesMatched: number; driveOnlyFiles: string[] }> {
  const driveFiles = await listDrivePdfs(userId, folderId);
  let driveFilesMatched = 0;
  const matchedDriveIds = new Set<string>();

  const { data: resumes } = await admin
    .from('resumes')
    .select('id, name, job_id, drive_file_id')
    .eq('user_id', userId);

  for (const resume of resumes || []) {
    if (resume.drive_file_id) {
      matchedDriveIds.add(String(resume.drive_file_id));
      continue;
    }

    const { data: job } = resume.job_id
      ? await admin.from('jobs').select('company, role').eq('id', resume.job_id).maybeSingle()
      : { data: null };

    const tailoredMatch = resume.name.match(/^Tailored:\s*(.+)$/i);
    let company = String(job?.company || '');
    let role = String(job?.role || '');
    if (!company && tailoredMatch) {
      const rest = tailoredMatch[1].trim();
      const slash = rest.indexOf(' / ');
      if (slash > 0) {
        company = rest.slice(0, slash).trim();
        role = rest.slice(slash + 3).trim();
      }
    }

    const expectedBase = await resolveResumePdfFileName(userId, {
      company: company || 'Company',
      role: role || resume.name,
      resumeName: resume.name,
    });
    const expectedKey = driveFileBaseKey(expectedBase);

    const candidates = driveFiles.filter((file) => {
      if (matchedDriveIds.has(file.id)) return false;
      return driveFileBaseKey(file.name) === expectedKey;
    });

    if (candidates.length === 0) continue;

    candidates.sort((a, b) => new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime());
    const best = candidates[0];
    await admin.from('resumes').update({
      drive_file_id: best.id,
      drive_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', resume.id);
    matchedDriveIds.add(best.id);
    driveFilesMatched++;
  }

  const driveOnlyFiles = driveFiles
    .filter((file) => !matchedDriveIds.has(file.id))
    .map((file) => file.name);

  return { driveFilesMatched, driveOnlyFiles };
}

export async function repairResumeSync(
  admin: AdminClient,
  userId: string,
  folderId?: string,
): Promise<RepairSyncResult> {
  const linkResult = await repairResumeJobLinks(admin, userId);

  let driveFilesMatched = 0;
  let driveOnlyFiles: string[] = [];
  if (folderId) {
    const driveResult = await reconcileDriveFiles(admin, userId, folderId);
    driveFilesMatched = driveResult.driveFilesMatched;
    driveOnlyFiles = driveResult.driveOnlyFiles;
  }

  const { data: allJobs } = await admin.from('jobs').select('id').eq('user_id', userId);
  const { data: linkedResumes } = await admin
    .from('resumes')
    .select('job_id')
    .eq('user_id', userId)
    .not('job_id', 'is', null);
  const linkedJobIds = new Set((linkedResumes || []).map((row) => row.job_id));
  const jobsWithoutResume = (allJobs || []).filter((job) => !linkedJobIds.has(job.id)).length;

  const { count: resumesWithoutJob } = await admin
    .from('resumes')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .like('name', 'Tailored:%')
    .is('job_id', null);

  return {
    resumesLinkedToJobs: linkResult.resumesLinkedToJobs,
    jobsLinkedToResumes: linkResult.jobsLinkedToResumes,
    driveFilesMatched,
    driveOnlyFiles,
    jobsWithoutResume,
    resumesWithoutJob: resumesWithoutJob ?? 0,
  };
}
