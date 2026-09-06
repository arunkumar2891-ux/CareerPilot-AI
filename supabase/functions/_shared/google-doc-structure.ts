import { fetchWithTimeout } from './fetch-timeout.ts';

type DocParagraphElement = {
  startIndex?: number;
  endIndex?: number;
  textRun?: { content?: string };
};

type DocStructuralElement = {
  startIndex?: number;
  endIndex?: number;
  paragraph?: { elements?: DocParagraphElement[] };
  table?: {
    tableRows?: Array<{
      tableCells?: Array<{ content?: DocStructuralElement[] }>;
    }>;
  };
  sectionBreak?: unknown;
  tableOfContents?: unknown;
};

export type GoogleDocument = {
  body?: { content?: DocStructuralElement[] };
};

export interface DocumentTextMap {
  text: string;
  docIndexAt(offset: number): number;
}

export interface DocumentSectionRange {
  startIndex: number;
  endIndex: number;
  matchedText: string;
}

function walkStructuralElements(
  elements: DocStructuralElement[] | undefined,
  onText: (text: string, startIndex: number) => void,
): void {
  for (const element of elements || []) {
    if (element.paragraph?.elements) {
      for (const part of element.paragraph.elements) {
        const content = part.textRun?.content;
        if (!content || part.startIndex == null) continue;
        onText(content, part.startIndex);
      }
    }
    if (element.table?.tableRows) {
      for (const row of element.table.tableRows) {
        for (const cell of row.tableCells || []) {
          walkStructuralElements(cell.content, onText);
        }
      }
    }
  }
}

export function buildDocumentTextMap(doc: GoogleDocument): DocumentTextMap {
  let text = '';
  const indexMap: number[] = [];

  walkStructuralElements(doc.body?.content, (chunk, startIndex) => {
    for (let i = 0; i < chunk.length; i++) {
      text += chunk[i];
      indexMap.push(startIndex + i);
    }
  });

  return {
    text,
    docIndexAt: (offset: number) => indexMap[offset] ?? -1,
  };
}

const CAREERPILOT_START_RE = /---\s*Project:\s*CareerPilot AI/i;
const NEXT_PROJECT_RE = /\n---\s*Project:\s*(?!CareerPilot AI)/i;

export function findCareerPilotSectionRange(map: DocumentTextMap): DocumentSectionRange | null {
  const normalized = map.text.replace(/\r\n/g, '\n');
  const startMatch = CAREERPILOT_START_RE.exec(normalized);
  if (!startMatch || startMatch.index == null) return null;

  const textStart = startMatch.index;
  const afterStart = normalized.slice(textStart + startMatch[0].length);
  const endRel = NEXT_PROJECT_RE.exec(afterStart);
  const textEnd = endRel?.index != null
    ? textStart + startMatch[0].length + endRel.index
    : normalized.length;

  const docStart = map.docIndexAt(textStart);
  const docEnd = map.docIndexAt(Math.max(textEnd - 1, textStart));
  if (docStart < 0 || docEnd < 0) return null;

  return {
    startIndex: docStart,
    endIndex: docEnd + 1,
    matchedText: normalized.slice(textStart, textEnd).trim(),
  };
}

export async function fetchGoogleDocument(accessToken: string, fileId: string): Promise<GoogleDocument> {
  const res = await fetchWithTimeout(
    `https://docs.googleapis.com/v1/documents/${fileId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
    30000,
    'Google Docs get',
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { error?: { message?: string } }).error?.message || 'Failed to fetch Google Doc structure',
    );
  }
  return await res.json() as GoogleDocument;
}

export interface BatchUpdateResult {
  requestCount: number;
  occurrencesChanged: number;
}

export async function batchUpdateGoogleDoc(
  accessToken: string,
  fileId: string,
  requests: Record<string, unknown>[],
): Promise<BatchUpdateResult> {
  if (!requests.length) return { requestCount: 0, occurrencesChanged: 0 };

  const res = await fetchWithTimeout(
    `https://docs.googleapis.com/v1/documents/${fileId}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests }),
    },
    30000,
    'Google Docs batchUpdate',
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const message = (err as { error?: { message?: string } }).error?.message || 'Google Docs update failed';
    if (/insufficient|scope|permission/i.test(message)) {
      throw new Error('Google Docs write permission required. Reconnect Google Drive in Integrations (documents scope).');
    }
    throw new Error(message);
  }

  const body = await res.json() as {
    replies?: Array<{ replaceAllText?: { occurrencesChanged?: number } }>;
  };
  const occurrencesChanged = (body.replies || []).reduce(
    (sum, reply) => sum + Number(reply.replaceAllText?.occurrencesChanged ?? 0),
    0,
  );
  return { requestCount: body.replies?.length ?? requests.length, occurrencesChanged };
}

export async function replaceDocumentRange(
  accessToken: string,
  fileId: string,
  range: DocumentSectionRange,
  newText: string,
): Promise<BatchUpdateResult> {
  const insertText = `${newText.trim()}\n\n`;
  return await batchUpdateGoogleDoc(accessToken, fileId, [
    {
      deleteContentRange: {
        range: {
          startIndex: range.startIndex,
          endIndex: range.endIndex,
        },
      },
    },
    {
      insertText: {
        location: { index: range.startIndex },
        text: insertText,
      },
    },
  ]);
}

export async function insertDocumentText(
  accessToken: string,
  fileId: string,
  index: number,
  text: string,
): Promise<BatchUpdateResult> {
  return await batchUpdateGoogleDoc(accessToken, fileId, [{
    insertText: {
      location: { index },
      text,
    },
  }]);
}
