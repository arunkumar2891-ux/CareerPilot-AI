export type AiProviderName = 'gemini' | 'groq';

export type AiOperation = 'chat' | 'resume_tailoring' | 'ats_score';

export interface GenerateRequest {
  systemPrompt: string;
  userPrompt: string;
  operation: AiOperation;
  timeoutMs?: number;
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

export interface ProviderAdapter {
  name: AiProviderName;
  isConfigured(): boolean;
  generate(req: GenerateRequest): Promise<string>;
}
