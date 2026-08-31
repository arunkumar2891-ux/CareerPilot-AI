import { createUserClient, jsonResponse, corsHeaders } from '../_shared/supabase-admin.ts';
import { ATS_SYSTEM_PROMPT, buildResumeUserPrompt } from '../_shared/career-corpus/prompt.ts';
import { loadCareerCorpus } from '../_shared/career-corpus/load.ts';
import { callGeminiAtsGenerateContent, callGeminiGenerateContent } from '../_shared/gemini.ts';

async function callGemini(messages: { role: string; content: string }[], systemPrompt?: string): Promise<string> {
  const userText = messages.map((m) => `${m.role}: ${m.content}`).join('\n\n');
  return await callGeminiGenerateContent(systemPrompt || 'You are a helpful assistant.', userText);
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
      const { syncGoogleDocToCorpus } = await import('../_shared/google-doc-sync.ts');

      const fileId = String(body.fileId || '').trim();
      if (!fileId) return jsonResponse({ error: 'fileId is required' }, 400);

      const sync = await syncGoogleDocToCorpus(user.id, fileId);

      return jsonResponse({
        chunksExtracted: sync.chunksExtracted,
        newChunksAdded: sync.newChunksAdded,
        totalExisting: sync.totalExisting,
        resumeUpdated: sync.resumeUpdated,
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
      const reply = await callGeminiAtsGenerateContent(ATS_SYSTEM_PROMPT, userPrompt);
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
