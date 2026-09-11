# AI Copilot (Chat)

## Purpose

Conversational AI assistant for career guidance, resume review, interview prep, and general career-related questions. Supports multiple chat modes including ATS scoring, resume generation, and interview preparation.

## Entry Points

- `/copilot` route → `src/pages/CopilotPage.tsx`
- Backend → `supabase/functions/ai-chat/index.ts`

## Flow

```
CopilotPage (chat UI)
  → services.chat.sendMessage()
    → supabase.functions.invoke('ai-chat')
      → ai/router.ts → gemini.ts or groq.ts
        → AI response
      → ai/usage.ts (track token usage)
    → store conversation in chat_conversations table
```

### ATS Score Mode
```
ai-chat { mode: 'ats_score', content: resumeText }
  → Gemini → JSON { score, feedback, suggestions }
```

### Resume Generation Mode
```
ai-chat { mode: 'generate_resume' }
  → career-corpus/generate.ts → prepareResumeGeneration()
    → Gemini with career corpus context → tailored resume
```

## Important Files

- `src/pages/CopilotPage.tsx` — Chat UI and conversation management
- `src/services/index.ts` → `ChatService`, `AIService`
- `supabase/functions/ai-chat/index.ts` — Chat backend endpoint
- `supabase/functions/_shared/ai/router.ts` — AI provider routing
- `supabase/functions/_shared/ai/gemini.ts` — Gemini API wrapper
- `supabase/functions/_shared/ai/groq.ts` — Groq API wrapper
- `supabase/functions/_shared/ai/usage.ts` — Token usage tracking
- `supabase/functions/_shared/ai/errors.ts` — AI error sanitization
- `supabase/functions/_shared/ai/config.ts` — Provider configuration
- `supabase/functions/_shared/career-corpus/prompt.ts` — ATS system prompt

## Data Flow

- Conversations stored in `chat_conversations` table with messages array.
- AI usage events tracked in `ai_usage_events` table per provider.
- Artifacts (generated resumes, analyses) embedded in message objects.

## External Dependencies

- Gemini API (primary AI provider)
- Groq API (secondary/fallback)

## Common Failure Points

- AI provider rate limits or API outages
- Token limit exceeded on large resume + job description inputs
- JSON parse failure on ATS score responses (AI may return malformed JSON)

## Important Rules

- Error messages from AI providers are sanitized before showing to user (`sanitizeAiErrorMessage`)
- Usage tracking happens on success only (via `refreshHeaderCredits`)
- Provider free tier limits tracked in `src/constants/ai-usage.ts`
