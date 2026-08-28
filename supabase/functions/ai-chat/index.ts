import { createUserClient, jsonResponse, corsHeaders } from '../_shared/supabase-admin.ts';
import { ATS_SYSTEM_PROMPT, buildResumeUserPrompt } from '../_shared/career-corpus/prompt.ts';
import { loadCareerCorpus } from '../_shared/career-corpus/load.ts';

async function callGemini(messages: { role: string; content: string }[], systemPrompt?: string): Promise<string> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const body: Record<string, unknown> = { contents };
  if (systemPrompt) body.system_instruction = { parts: [{ text: systemPrompt }] };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  );
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message || 'Gemini API error');
  return json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, 401);

    const supabase = createUserClient(authHeader);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const body = await req.json();
    const { messages, systemPrompt, mode, content, agentId } = body;

    if (mode === 'ats_score') {
      const result = await callGemini(
        [{ role: 'user', content: `Score this resume 0-100 for ATS compatibility. Return JSON: {"score": number, "feedback": string[]}\n\n${content}` }],
        'Return valid JSON only.',
      );
      try {
        const parsed = JSON.parse(result.replace(/```json\n?|\n?```/g, ''));
        return jsonResponse(parsed);
      } catch {
        return jsonResponse({ score: 75, feedback: [result.slice(0, 500)] });
      }
    }

    if (mode === 'embed') {
      return jsonResponse({ embedding: [] });
    }

    if (mode === 'sync_google_doc_chunks') {
      const { refreshGoogleToken } = await import('../_shared/credentials.ts');
      const { createAdminClient } = await import('../_shared/supabase-admin.ts');
      const admin = createAdminClient();

      const fileId = String(body.fileId || '').trim();
      if (!fileId) return jsonResponse({ error: 'fileId is required' }, 400);

      const accessToken = await refreshGoogleToken(user.id);
      const docRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!docRes.ok) {
        const err = await docRes.json().catch(() => ({}));
        throw new Error((err as { error?: { message?: string } }).error?.message || 'Failed to fetch Google Doc');
      }
      const docContent = await docRes.text();

      const TAG_KEYWORDS: Record<string, string[]> = {
        fw_flex: ['fw_flex', 'fw_register', 'firewall flex', 'worker pipeline'],
        snaplogic: ['snaplogic', 'snap reduction', 'snaps', 'pipeline', 'iPaaS'],
        bigquery: ['bigquery', 'bq', 'merge statement'],
        gcp: ['gcp', 'google cloud', 'vertex ai', 'gke', 'pub/sub'],
        performance: ['latency', 'performance', 'faster', 'improvement'],
        cost: ['cost reduction', 'cost', 'savings'],
        portal: ['portal', 'automations portal'],
        kubernetes: ['kubernetes', 'k8s', 'gke', 'helm', 'hpa'],
        security: ['security', 'vulnerability', 'compliance', 'vault'],
        leadership: ['mentor', 'workshop', 'training', 'documentation', 'team'],
        incident: ['incident', 'p1', 'root cause', 'rca'],
        integration: ['integration', 'standardiz', 'consolidat', 'framework'],
        fullstack: ['react', 'typescript', 'frontend', 'backend', 'express'],
        gemini: ['gemini', 'vertex ai', 'llm', 'ai agent', 'rag'],
        productivity: ['hours saved', 'roi', 'annual value'],
        refactor: ['refactor', 'monolith', 'reduction', 'consolidated'],
        reliability: ['uptime', '99.9', 'zero rollback', 'zero data loss'],
        observability: ['datadog', 'chronosphere', 'monitoring', 'logging'],
        devops: ['ci/cd', 'harness', 'docker', 'deployment'],
        documentation: ['specification', 'documentation', 'lines of'],
        adoption: ['users', 'concurrent', 'adoption'],
      };

      function inferTags(bullet: string): string[] {
        const lower = bullet.toLowerCase();
        const tags: string[] = [];
        for (const [tag, keywords] of Object.entries(TAG_KEYWORDS)) {
          if (keywords.some((kw) => lower.includes(kw))) tags.push(tag);
        }
        return tags.length ? tags : ['general'];
      }

      function hasMetric(line: string): boolean {
        const metricPattern = /\d+[%x×]|\d+-\d+x|\d+\.\d+[x%]|\b\d{2,}\b/;
        const verbs = /\b(achieved|delivered|reduced|improved|saved|built|implemented|designed|architected|deployed|migrated|resolved|eliminated|consolidated|created|integrated|established)\b/i;
        return metricPattern.test(line) && verbs.test(line);
      }

      const lines = docContent.split('\n');
      const chunks: { id: string; tags: string[]; text: string }[] = [];
      const seenTexts = new Set<string>();

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith('- ') && !line.startsWith('• ')) continue;
        const bullet = line.replace(/^[-•]\s*/, '').trim();
        if (bullet.length < 50) continue;
        if (!hasMetric(bullet)) continue;
        const norm = bullet.toLowerCase().replace(/\s+/g, ' ');
        if (seenTexts.has(norm)) continue;
        seenTexts.add(norm);
        const tags = inferTags(bullet);
        const id = bullet.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w) => w.length > 3).slice(0, 4).join('-').slice(0, 40) || `chunk-${chunks.length}`;
        chunks.push({ id, tags, text: bullet });
      }

      const { data: existing } = await admin
        .from('knowledge_chunks')
        .select('content')
        .eq('user_id', user.id)
        .eq('collection', 'career');
      const existingTexts = new Set((existing || []).map((c) => String(c.content || '').toLowerCase().replace(/\s+/g, ' ')));

      const toInsert = chunks
        .filter((c) => !existingTexts.has(c.text.toLowerCase().replace(/\s+/g, ' ')))
        .map((c) => ({
          user_id: user.id,
          collection: 'career',
          source_id: c.id,
          tags: c.tags,
          content: c.text,
        }));

      if (toInsert.length > 0) {
        await admin.from('knowledge_chunks').insert(toInsert);
      }

      // Also update the Master ATS resume content in the resumes table
      const endIdx = docContent.indexOf('END OF MASTER RESUME');
      let resumeContent = docContent;
      if (endIdx !== -1) resumeContent = docContent.slice(0, endIdx).trim();
      const tailoringIdx = resumeContent.indexOf('TAILORING INSTRUCTIONS');
      if (tailoringIdx !== -1) resumeContent = resumeContent.slice(0, resumeContent.lastIndexOf('=', tailoringIdx)).trim();

      await admin.from('resumes')
        .update({ content: resumeContent })
        .eq('user_id', user.id)
        .eq('name', 'Master ATS (bullet bank)');

      return jsonResponse({
        chunksExtracted: chunks.length,
        newChunksAdded: toInsert.length,
        totalExisting: (existing || []).length + toInsert.length,
        resumeUpdated: true,
      });
    }

    if (mode === 'resume') {
      const jd = String(body.jobDescription || content || '');
      const corpus = await loadCareerCorpus(user.id, jd);
      const userPrompt = buildResumeUserPrompt({
        jobTitle: String(body.jobTitle || ''),
        company: String(body.company || ''),
        jobDescription: jd,
        playbookTitle: corpus.playbookTitle,
        playbookInstructions: corpus.playbookInstructions,
        masterResume: corpus.masterResume,
        twoPageTemplate: corpus.twoPageTemplate,
        evidence: corpus.evidence,
        contactBlock: corpus.contactBlock,
      });
      const reply = await callGemini([{ role: 'user', content: userPrompt }], ATS_SYSTEM_PROMPT);
      return jsonResponse({ reply, playbook: corpus.playbookTitle, tokens: reply.length / 4 });
    }

    let prompt = systemPrompt || ATS_SYSTEM_PROMPT;
    if (agentId) {
      const { data: agent } = await supabase.from('agents').select('prompt, model').eq('id', agentId).maybeSingle();
      if (agent) prompt = agent.prompt;
    }

    const reply = await callGemini(messages || [{ role: 'user', content: content || '' }], prompt);
    return jsonResponse({ reply, tokens: reply.length / 4 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 500);
  }
});
