export type AiProviderName = 'gemini' | 'gemini_fallback' | 'groq';

export type AiOperation = 'chat' | 'resume_tailoring' | 'resume_rerank' | 'ats_score';

export interface DeterministicResumeInput {
  contactBlock: string;
  summarySource: string;
  skillsSource: string;
  educationSource: string;
  certificationSource?: string;
  rerankedBulletIds: string[];
  catalog: Array<{ id: string; text: string; isBullet: boolean }>;
  maxExperienceBullets?: number;
}

export interface GenerateRequest {
  systemPrompt: string;
  userPrompt: string;
  operation: AiOperation;
  timeoutMs?: number;
  /** For resume tailoring, every output line must be traceable to this source. */
  groundingSource?: string;
  skillsSource?: string;
  educationSource?: string;
  certificationSource?: string;
  /** Skip the compact 2-page length checks (role-bank corpus generation). */
  skipTwoPageShape?: boolean;
  /** Smaller user prompt for Groq TPM limits on resume fallback. */
  groqUserPrompt?: string;
  /** Catalog-backed assembly when LLM providers fail. */
  deterministicResume?: DeterministicResumeInput;
}

export class ProviderError extends Error {
  readonly provider: AiProviderName;
  readonly retryable: boolean;
  readonly status?: number;
  readonly kind: string;

  constructor(opts: {
    provider: AiProviderName;
    message: string;
    retryable: boolean;
    status?: number;
    kind: string;
  }) {
    super(opts.message);
    this.name = 'ProviderError';
    this.provider = opts.provider;
    this.retryable = opts.retryable;
    this.status = opts.status;
    this.kind = opts.kind;
  }
}

export interface GenerateResult {
  text: string;
  tokensInput: number;
  tokensOutput: number;
}

export function totalTokens(result: Pick<GenerateResult, 'tokensInput' | 'tokensOutput'>): number {
  return result.tokensInput + result.tokensOutput;
}

export interface ProviderAdapter {
  name: AiProviderName;
  isConfigured(): boolean;
  generate(req: GenerateRequest): Promise<GenerateResult>;
}
