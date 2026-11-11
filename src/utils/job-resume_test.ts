import {
  describeJobResume,
  jobResumesIncludingStoredPdfs,
  pickResumeForJob,
  planStoredJobResumes,
  storagePathFromSignedPdfUrl,
  storedFileNamesFromLogs,
  storedPdfFileName,
} from './job-resume.ts';

Deno.test('describeJobResume shows a stored PDF even when no resume row is linked', () => {
  const view = describeJobResume({
    resumeStatus: 'ready',
    pdfUrl: 'https://example.supabase.co/storage/v1/object/sign/resumes/user/resumes/GlobalLogic_Arun_11112026.pdf?token=abc',
  });
  if (!view.show) throw new Error('stored PDF must be visible');
  if (!view.canOpenStoredPdf) throw new Error('stored PDF must be openable');
  if (view.linked) throw new Error('no resume row');
  if (view.missing) throw new Error('a stored PDF is not a missing resume');
});

Deno.test('describeJobResume shows a linked resume without a PDF url', () => {
  const view = describeJobResume({ resumeStatus: 'ready', resumeId: 'resume-1' });
  if (!view.show || !view.linked) throw new Error('linked resume must show');
  if (view.canOpenStoredPdf) throw new Error('nothing to download yet');
  if (view.missing) throw new Error('linked resume is not missing');
});

Deno.test('describeJobResume flags resume_ready with neither a row nor a PDF', () => {
  const view = describeJobResume({ resumeStatus: 'ready' });
  if (view.show || view.canOpenStoredPdf) throw new Error('nothing was stored');
  if (!view.missing) throw new Error('should warn that the resume is missing');
});

Deno.test('describeJobResume does not warn while a resume is still generating', () => {
  const view = describeJobResume({ resumeStatus: 'generating' });
  if (view.missing || view.show) throw new Error(JSON.stringify(view));
});

Deno.test('pickResumeForJob keeps the row that has the compiled PDF', () => {
  const picked = pickResumeForJob([
    { id: 'old', job_id: 'job-1', name: 'Tailored: Acme (aaaaaaaa)' },
    {
      id: 'pdf',
      job_id: 'job-1',
      name: 'Tailored: Acme (aaaaaaaa)',
      storage_path: 'user/resumes/Acme_Arun_Engineer_11112026.pdf',
      pdf_url: 'https://example/file.pdf',
    },
  ]);
  if (picked.get('job-1')?.id !== 'pdf') throw new Error(`picked ${picked.get('job-1')?.id}`);
});

Deno.test('pickResumeForJob does not replace a PDF row with a later text-only row', () => {
  const picked = pickResumeForJob([
    { id: 'pdf', job_id: 'job-1', storage_path: 'user/resumes/a.pdf' },
    { id: 'later', job_id: 'job-1', name: 'Tailored: Acme' },
  ]);
  if (picked.get('job-1')?.id !== 'pdf') throw new Error(`picked ${picked.get('job-1')?.id}`);
});

Deno.test('storedPdfFileName reads the PDF name from a storage path or signed URL', () => {
  const name = 'GlobalLogic_ArunkumarJS_AIEngineeringIRC306669_11112026.pdf';
  const fromPath = storedPdfFileName(`user-1/resumes/${name}`);
  const fromUrl = storedPdfFileName(
    `https://abc.supabase.co/storage/v1/object/sign/resumes/user-1/resumes/${name}?token=eyJ`,
  );
  if (fromPath !== name) throw new Error(fromPath);
  if (fromUrl !== name) throw new Error(fromUrl);
  if (storedPdfFileName('https://example.com/not-a-pdf')) throw new Error('non-pdf should be blank');
});

Deno.test('storedFileNamesFromLogs reads the Upload to Storage log line', () => {
  const names = storedFileNamesFromLogs([
    { message: 'Completed node: Upload to Storage (storage) in 2887ms [job 1/1]' },
    { message: 'Stored file: GlobalLogic_ArunkumarJS_AIEngineeringIRC306669_11112026.pdf' },
    { message: 'Finished job 1/1 pipeline in 73765ms' },
  ]);
  if (names.length !== 1) throw new Error(`expected 1 name, got ${names.length}`);
  if (!names[0].startsWith('GlobalLogic_')) throw new Error(names[0]);
});

const storedPdfUrl = 'https://abc.supabase.co/storage/v1/object/sign/resumes/user-1/resumes/GlobalLogic_ArunkumarJS_AIEngineeringIRC306669_11112026.pdf?token=eyJ';

Deno.test('storagePathFromSignedPdfUrl reads the object path inside the resumes bucket', () => {
  const path = storagePathFromSignedPdfUrl(storedPdfUrl);
  if (path !== 'user-1/resumes/GlobalLogic_ArunkumarJS_AIEngineeringIRC306669_11112026.pdf') {
    throw new Error(path);
  }
  if (storagePathFromSignedPdfUrl('https://example.com/files/resume.pdf')) {
    throw new Error('unrelated URL must not invent a storage path');
  }
  if (storagePathFromSignedPdfUrl('https://abc.supabase.co/storage/v1/object/sign/resumes/user-1/../secrets.pdf?token=x')) {
    throw new Error('path traversal must be rejected');
  }
});

Deno.test('planStoredJobResumes adds a Resumes-page row for a stored PDF with no resume', () => {
  const plan = planStoredJobResumes(
    [{ id: 'job-1234abcd', company: 'GlobalLogic', role: 'AI Engineer', pdf_url: storedPdfUrl, created_at: '2026-11-11T03:45:18.573Z' }],
    [],
  );
  if (plan.attach.length !== 0) throw new Error('nothing to attach');
  if (plan.create.length !== 1) throw new Error(`expected 1 create, got ${plan.create.length}`);
  const created = plan.create[0];
  if (!created.name.startsWith('Tailored: GlobalLogic AI Engineer')) throw new Error(created.name);
  if (!created.name.endsWith('(job1234a)')) throw new Error(created.name);
  if (!created.storagePath.endsWith('GlobalLogic_ArunkumarJS_AIEngineeringIRC306669_11112026.pdf')) {
    throw new Error(created.storagePath);
  }
});

Deno.test('planStoredJobResumes does not duplicate a resume already linked to the job', () => {
  const plan = planStoredJobResumes(
    [{ id: 'job-1', company: 'GlobalLogic', role: 'AI Engineer', pdf_url: storedPdfUrl }],
    [{ id: 'resume-1', job_id: 'job-1', name: 'Tailored: GlobalLogic AI Engineer (job1)', pdf_url: storedPdfUrl, storage_path: 'user-1/resumes/file.pdf' }],
  );
  if (plan.create.length || plan.attach.length) throw new Error(JSON.stringify(plan));
});

Deno.test('planStoredJobResumes attaches the stored PDF onto a linked resume that has no file', () => {
  const plan = planStoredJobResumes(
    [{ id: 'job-1', company: 'GlobalLogic', role: 'AI Engineer', pdf_url: storedPdfUrl }],
    [{ id: 'resume-1', job_id: 'job-1', name: 'Tailored: GlobalLogic AI Engineer' }],
  );
  if (plan.create.length !== 0) throw new Error('resume row already exists');
  if (plan.attach.length !== 1 || plan.attach[0].resumeId !== 'resume-1') throw new Error(JSON.stringify(plan));
  if (!plan.attach[0].storagePath.includes('GlobalLogic_')) throw new Error(plan.attach[0].storagePath);
});

Deno.test('jobResumesIncludingStoredPdfs shows the stored PDF on the Resumes page', () => {
  const shown = jobResumesIncludingStoredPdfs([], [{
    id: 'job-1234abcd',
    company: 'GlobalLogic',
    role: 'AI Engineer',
    pdf_url: storedPdfUrl,
    created_at: '2026-11-11T03:45:18.573Z',
  }]);
  if (shown.length !== 1) throw new Error(`expected 1 resume, got ${shown.length}`);
  if (!shown[0].synthetic) throw new Error('fallback card must be marked synthetic');
  if (shown[0].jobId !== 'job-1234abcd') throw new Error(shown[0].jobId || 'missing job');
  if (!shown[0].pdfUrl) throw new Error('pdf url missing');
  const fileName = storedPdfFileName(shown[0].storagePath || shown[0].pdfUrl);
  if (fileName !== 'GlobalLogic_ArunkumarJS_AIEngineeringIRC306669_11112026.pdf') throw new Error(fileName);
});
