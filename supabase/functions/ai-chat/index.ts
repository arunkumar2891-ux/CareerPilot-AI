import { createUserClient, jsonResponse, corsHeaders } from '../_shared/supabase-admin.ts';
import { ATS_SYSTEM_PROMPT, buildResumeUserPrompt, buildGroqResumeUserPrompt } from '../_shared/career-corpus/prompt.ts';
import { loadCareerCorpus } from '../_shared/career-corpus/load.ts';
import { callGeminiAtsGenerateContent, callGeminiGenerateContent } from '../_shared/gemini.ts';
import { sanitizeAiErrorMessage } from '../_shared/ai/errors.ts';

async function callGemini(
  userId: string,
  messages: { role: string; content: string }[],
  systemPrompt?: string,
): Promise<string> {
  const userText = messages.map((m) => `${m.role}: ${m.content}`).join('\n\n');
  return await callGeminiGenerateContent(systemPrompt || 'You are a helpful assistant.', userText, { userId });
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
      const result = await callGeminiGenerateContent(
        'Return valid JSON only.',
        `Score this resume 0-100 for ATS compatibility. Return JSON only: {"score": number, "feedback": string[], "suggestions": string[]}. Feedback should identify specific issues; suggestions should be truthful, actionable improvements that do not invent experience.\n\n${content}`,
        { operation: 'ats_score', userId: user.id },
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

    if (mode === 'sync_careerpilot_project' || mode === 'sync_careerpilot_metrics') {
      const { createAdminClient } = await import('../_shared/supabase-admin.ts');
      const { syncCareerPilotProjectToGoogleDoc } = await import('../_shared/google-doc-careerpilot-sync.ts');
      const { getUserSettings } = await import('../_shared/credentials.ts');

      const settings = await getUserSettings(user.id);
      const jobSearch = settings.jobSearch as Record<string, unknown> | undefined;
      const fileId = String(body.fileId || '').trim() || String(jobSearch?.resumeFileId || '').trim();
      if (!fileId) return jsonResponse({ error: 'fileId or Settings → Google Doc ID is required' }, 400);

      const admin = createAdminClient();
      const result = await syncCareerPilotProjectToGoogleDoc(admin, user.id, fileId);
      return jsonResponse(result);
    }

    if (mode === 'resume') {
      const jd = String(body.jobDescription || content || '');
      const corpus = await loadCareerCorpus(user.id, jd, {
        jobTitle: String(body.jobTitle || ''),
        company: String(body.company || ''),
      });
      const userPrompt = buildResumeUserPrompt({
        jobTitle: String(body.jobTitle || ''),
        company: String(body.company || ''),
        jobDescription: jd,
        playbookTitle: corpus.playbookTitle,
        playbookInstructions: corpus.playbookInstructions,
        masterResume: corpus.masterResume,
        twoPageTemplate: corpus.twoPageTemplate,
        bulletCatalog: corpus.bulletCatalog,
        retrievedEvidence: corpus.retrievedEvidence,
        rerankedSelection: corpus.rerankedSelection,
        lexicalMatches: corpus.lexicalMatches,
        contactBlock: corpus.contactBlock,
        skillsSource: corpus.skillsSource,
        educationSource: corpus.educationSource,
        summarySource: corpus.summarySource,
      });
      const groqUserPrompt = buildGroqResumeUserPrompt({
        jobTitle: String(body.jobTitle || ''),
        company: String(body.company || ''),
        jobDescription: jd,
        bulletCatalog: corpus.bulletCatalog,
        retrievedEvidence: corpus.retrievedEvidence,
        rerankedSelection: corpus.rerankedSelection,
        contactBlock: corpus.contactBlock,
        skillsSource: corpus.skillsSource,
        educationSource: corpus.educationSource,
        summarySource: corpus.summarySource,
      });
      const generated = await callGeminiAtsGenerateContent(
        ATS_SYSTEM_PROMPT,
        userPrompt,
        user.id,
        corpus.groundingSource,
        {
          skillsSource: corpus.skillsSource,
          educationSource: corpus.educationSource,
          groqUserPrompt,
          deterministicResume: {
            contactBlock: corpus.contactBlock,
            summarySource: corpus.summarySource,
            skillsSource: corpus.skillsSource,
            educationSource: corpus.educationSource,
            rerankedBulletIds: corpus.rerankedBulletIds,
            catalog: corpus.catalog,
          },
        },
      );
      return jsonResponse({
        reply: generated.text,
        playbook: corpus.playbookTitle,
        tokens: generated.tokensTotal,
      });
    }

    if (mode === 'resume_improvement') {
      const review = (body.atsReview && typeof body.atsReview === 'object')
        ? body.atsReview as Record<string, unknown>
        : {};
      const feedback = Array.isArray(review.feedback) ? review.feedback.map(String) : [];
      const suggestions = Array.isArray(review.suggestions) ? review.suggestions.map(String) : [];
      const score = Number(review.score || 0);
      const resumeContent = String(body.resumeContent || '');
      const prompt = [
        'You are a collaborative resume editor in CareerPilot AI.',
        'Work as a natural conversation, not as a one-shot rewrite. Use the ATS review and resume below as context.',
        'Never invent achievements, responsibilities, metrics, skills, certifications, employers, or dates. When a useful change needs missing facts, ask focused clarifying questions before proposing it.',
        'Do not assume you can edit the resume directly. The user decides whether to apply suggestions manually. After the user has resolved the needed uncertainties, offer precise Markdown edits or a clearly labelled revised section that they can review.',
        'When the user opens this conversation, first summarize the highest-impact issues briefly and ask the minimum necessary question(s) to determine what can be changed truthfully. If no clarification is needed, say so and ask whether they want a proposed patch.',
        `ATS SCORE: ${score}/100`,
        `ATS FEEDBACK:\n${feedback.length ? feedback.map((item, index) => `${index + 1}. ${item}`).join('\n') : 'No feedback was returned.'}`,
        `ATS SUGGESTIONS:\n${suggestions.length ? suggestions.map((item, index) => `${index + 1}. ${item}`).join('\n') : 'No additional suggestions were returned.'}`,
        `CURRENT RESUME:\n${resumeContent || 'Resume content was unavailable. Ask the user to provide the relevant section.'}`,
      ].join('\n\n');
      const reply = await callGemini(user.id, messages || [{ role: 'user', content: content || '' }], prompt);
      return jsonResponse({ reply, tokens: reply.length / 4 });
    }

    let prompt = systemPrompt || ATS_SYSTEM_PROMPT;
    if (agentId) {
      const { data: agent } = await supabase.from('agents').select('prompt, model').eq('id', agentId).maybeSingle();
      if (agent) prompt = agent.prompt;
    }

    const reply = await callGemini(user.id, messages || [{ role: 'user', content: content || '' }], prompt);
    return jsonResponse({ reply, tokens: reply.length / 4 });
  } catch (err) {
    const message = sanitizeAiErrorMessage(err instanceof Error ? err.message : String(err));
    return jsonResponse({ error: message }, 500);
  }
});
