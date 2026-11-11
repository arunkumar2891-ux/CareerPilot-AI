import {
  describeJobResume,
  pickResumeForJob,
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
