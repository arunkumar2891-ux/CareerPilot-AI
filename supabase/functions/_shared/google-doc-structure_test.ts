import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildDocumentTextMap,
  findCareerPilotSectionRange,
} from './google-doc-structure.ts';

function mockDoc(paragraphs: string[]) {
  let index = 1;
  const content = paragraphs.map((text) => {
    const startIndex = index;
    const endIndex = index + text.length;
    index = endIndex;
    return {
      paragraph: {
        elements: [{ startIndex, endIndex, textRun: { content: text } }],
      },
    };
  });
  return { body: { content } };
}

Deno.test('findCareerPilotSectionRange returns doc indices', () => {
  const doc = mockDoc([
    '--- Project: Pic-Reel ---\n',
    'foo\n',
    '--- Project: CareerPilot AI — Autonomous Job Search Platform ---\n',
    'Role: GenAI Developer\n',
    '- [CareerPilot] Jobs discovered: 0\n',
    '--- Project: Cric-Scorer ---\n',
    'bar\n',
  ]);
  const map = buildDocumentTextMap(doc);
  const range = findCareerPilotSectionRange(map);
  assertEquals(range != null, true);
  assertEquals(range!.matchedText.includes('CareerPilot AI'), true);
  assertEquals(range!.matchedText.includes('Cric-Scorer'), false);
  assertEquals(range!.startIndex > 0, true);
  assertEquals(range!.endIndex > range!.startIndex, true);
});
