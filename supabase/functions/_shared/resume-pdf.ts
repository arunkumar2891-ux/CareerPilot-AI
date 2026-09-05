import { buildLatexFromAtsText } from './resume-latex.ts';
import { fetchWithTimeout } from './fetch-timeout.ts';

export async function compileLatexToPdf(latex: string): Promise<Uint8Array> {
  const compilerUrl = Deno.env.get('LATEX_COMPILER_URL') || 'https://latex.ytotech.com/builds/sync';
  const res = await fetchWithTimeout(
    compilerUrl,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ compiler: 'lualatex', resources: [{ main: true, content: latex }] }),
    },
    60000,
    'LaTeX compile',
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LaTeX compile failed: ${err.slice(0, 200)}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

export async function compileResumeContentToPdf(
  content: string,
  meta: { targetRole?: string; targetCompany?: string } = {},
): Promise<Uint8Array> {
  const latex = buildLatexFromAtsText(String(content || '').trim(), meta);
  return compileLatexToPdf(latex);
}
