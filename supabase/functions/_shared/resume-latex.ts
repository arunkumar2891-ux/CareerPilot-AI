export interface ResumeLatexMeta {
  targetRole?: string;
  targetCompany?: string;
  template?: PdfTemplate;
}

export type PdfTemplate = 'classic' | 'modern_single' | 'modern_two_column';

function esc(s: string): string {
  return String(s ?? '')
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/&/g, '\\&')
    .replace(/%/g, '\\%')
    .replace(/\$/g, '\\$')
    .replace(/#/g, '\\#')
    .replace(/_/g, '\\_')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\^/g, '\\textasciicircum{}');
}

function extractSection(raw: string, header: string): string {
  const escaped = header.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`(?:^|\\n)${escaped}\\s*\\n([\\s\\S]*?)(?=\\n(?:NAME|CONTACT|SUMMARY|SKILLS|PROFESSIONAL EXPERIENCE|CERTIFICATION|CERTIFICATIONS|EDUCATION|TECHNICAL SKILLS)\\s*\\n|$)`, 'i'),
    new RegExp(`(?:^|\\n)${escaped}\\s*:?\\s*\\n([\\s\\S]*?)(?=\\n(?:NAME|CONTACT|SUMMARY|SKILLS|PROFESSIONAL EXPERIENCE|CERTIFICATION|CERTIFICATIONS|EDUCATION|TECHNICAL SKILLS)\\s*:?\\s*\\n|$)`, 'i'),
  ];
  for (const re of patterns) {
    const m = raw.match(re);
    if (m?.[1]?.trim()) return m[1].trim();
  }
  return '';
}

function parseContactFields(contactRaw: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of contactRaw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const colon = trimmed.indexOf(':');
    if (colon > 0) {
      const key = trimmed.slice(0, colon).trim().toLowerCase();
      const value = trimmed.slice(colon + 1).trim();
      if (value) fields[key] = value;
    }
  }
  return fields;
}

function splitName(fullName: string): { first: string; last: string } {
  const cleaned = fullName.trim().replace(/\s+/g, ' ');
  if (!cleaned) return { first: 'Your', last: 'Name' };
  const parts = cleaned.split(' ');
  if (parts.length === 1) return { first: esc(parts[0]), last: '' };
  return {
    first: esc(parts.slice(0, -1).join(' ')),
    last: esc(parts[parts.length - 1]),
  };
}

function formatBulletList(items: string[]): string {
  if (!items.length) return '';
  const body = items.map((item) => `\\item ${esc(item)}`).join('\n');
  return `\\begin{itemize}[leftmargin=*, nosep]\n${body}\n\\end{itemize}`;
}

function formatExperienceLatex(experienceRaw: string): string {
  if (!experienceRaw.trim()) return '';
  const lines = experienceRaw.split('\n');
  const blocks: string[] = [];
  let currentLabel = '';
  let bullets: string[] = [];
  let preamble: string[] = [];

  const flush = () => {
    if (bullets.length > 0) {
      const label = esc(currentLabel || 'Professional Experience');
      blocks.push(`\\cvitem{${label}}{${formatBulletList(bullets)}}`);
      bullets = [];
    } else if (preamble.length > 0) {
      blocks.push(`\\cvitem{}{${esc(preamble.join(' '))}}`);
      preamble = [];
    }
    currentLabel = '';
  };

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;

    if (t.startsWith('- ') || t.startsWith('• ')) {
      bullets.push(t.replace(/^[-•]\s*/, '').trim());
      continue;
    }

    const projectMatch = t.match(/^(?:PROJECT|Role|Technologies|Duration):\s*(.*)$/i)
      || t.match(/^---\s*Project:\s*(.+?)---\s*$/i)
      || t.match(/^---\s*Project:\s*(.+)$/i);
    if (projectMatch) {
      flush();
      const label = projectMatch[1]?.trim() || t;
      currentLabel = label.slice(0, 72);
      continue;
    }

    if (/^(PALO ALTO|INFOSYS|TATA|TCS|PROJECT:|CRITICAL|SECURITY|LEADERSHIP)/i.test(t) && t.length < 100) {
      flush();
      currentLabel = t.slice(0, 72);
      continue;
    }

    if (bullets.length === 0 && preamble.length < 2 && t.length < 140) {
      preamble.push(t);
    } else {
      if (preamble.length) {
        bullets.push(preamble.join(' '));
        preamble = [];
      }
      if (t.length > 20) bullets.push(t);
    }
  }
  flush();

  if (blocks.length === 0) {
    return `\\cvitem{Professional Experience}{${esc(experienceRaw.slice(0, 12000))}}`;
  }
  return blocks.join('\n\n');
}

function formatSkillsLatex(skillsRaw: string): string {
  const lines = skillsRaw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return '';
  const items: string[] = [];
  for (const line of lines) {
    if (line.startsWith('- ')) {
      items.push(line.slice(2).trim());
    } else if (line.endsWith(':')) {
      items.push(line);
    } else {
      items.push(line);
    }
  }
  return `\\cvitem{}{${formatBulletList(items)}}`;
}

function formatTwoColumnExperience(experienceRaw: string): string {
  if (!experienceRaw.trim()) return '';
  const lines = experienceRaw.split('\n');
  const entries: { label: string; bullets: string[] }[] = [];
  let currentLabel = '';
  let bullets: string[] = [];

  const flush = () => {
    if (bullets.length > 0 || currentLabel) {
      entries.push({ label: currentLabel || 'Experience', bullets: [...bullets] });
      bullets = [];
    }
  };

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;

    if (t.startsWith('- ') || t.startsWith('• ')) {
      bullets.push(t.replace(/^[-•]\s*/, '').trim());
      continue;
    }

    const projectMatch = t.match(/^(?:PROJECT|Role|Technologies|Duration):\s*(.*)$/i)
      || t.match(/^---\s*Project:\s*(.+?)---\s*$/i)
      || t.match(/^---\s*Project:\s*(.+)$/i);
    if (projectMatch) {
      flush();
      currentLabel = projectMatch[1]?.trim() || t;
      continue;
    }

    if (/^(PALO ALTO|INFOSYS|TATA|TCS|PROJECT:|CRITICAL|SECURITY|LEADERSHIP)/i.test(t) && t.length < 100) {
      flush();
      currentLabel = t;
      continue;
    }

    if (bullets.length === 0 && !currentLabel) {
      currentLabel = t;
    } else {
      bullets.push(t);
    }
  }
  flush();

  if (entries.length === 0) {
    return `\\textbf{Professional Experience}\n\\begin{itemize}[leftmargin=*, nosep]\n\\item ${esc(experienceRaw.slice(0, 12000))}\n\\end{itemize}`;
  }

  return entries.map((entry) => {
    const bulletList = entry.bullets.length
      ? `\\begin{itemize}[leftmargin=*, nosep]\n${entry.bullets.map((b) => `\\item ${esc(b)}`).join('\n')}\n\\end{itemize}`
      : '';
    return `\\textbf{${esc(entry.label)}}\n${bulletList}`;
  }).join('\n\n\\vspace{6pt}\n\n');
}

function buildClassicLatex(
  sections: Record<string, string>,
  contactFields: Record<string, string>,
  first: string,
  last: string,
): string {
  const titleLine = contactFields.title || '';
  const email = contactFields.email || '';
  const phone = contactFields.phone || '';
  const location = contactFields.location || '';
  const linkedin = contactFields.linkedin || '';
  const github = contactFields.github || '';

  const headerLines: string[] = [];
  if (titleLine) headerLines.push(`\\quote{${esc(titleLine)}}`);
  if (phone) headerLines.push(`\\phone[mobile]{${esc(phone)}}`);
  if (email) headerLines.push(`\\email{${esc(email)}}`);
  if (location) headerLines.push(`\\address{${esc(location)}}{}`);
  if (linkedin) {
    const url = linkedin.startsWith('http') ? linkedin : `https://${linkedin}`;
    headerLines.push(`\\social[linkedin]{${esc(url)}}`);
  }
  if (github) {
    const url = github.startsWith('http') ? github : `https://${github}`;
    headerLines.push(`\\social[github]{${esc(url)}}`);
  }

  const body: string[] = [];
  if (sections.summary) {
    body.push(`\\section{Summary}`);
    body.push(`\\cvitem{}{${esc(sections.summary.replace(/\n+/g, ' ').trim())}}`);
  }
  if (sections.skills) {
    body.push(`\\section{Skills}`);
    body.push(formatSkillsLatex(sections.skills));
  }
  if (sections.experience) {
    body.push(`\\section{Professional Experience}`);
    body.push(formatExperienceLatex(sections.experience));
  }
  if (sections.certification) {
    body.push(`\\section{Certification}`);
    body.push(formatSkillsLatex(sections.certification));
  }
  if (sections.education) {
    body.push(`\\section{Education}`);
    body.push(`\\cvitem{}{${esc(sections.education.replace(/\n+/g, ' ').trim())}}`);
  }

  return `\\documentclass[11pt,a4paper,sans]{moderncv}
\\moderncvstyle{banking}
\\moderncvcolor{blue}
\\usepackage[scale=0.88]{geometry}
\\usepackage{enumitem}
\\name{${first}}{${last}}
${headerLines.join('\n')}
\\begin{document}
\\makecvtitle
${body.join('\n\n')}
\\end{document}`;
}

function buildModernSingleLatex(
  sections: Record<string, string>,
  contactFields: Record<string, string>,
  first: string,
  last: string,
): string {
  const titleLine = contactFields.title || '';
  const email = contactFields.email || '';
  const phone = contactFields.phone || '';
  const location = contactFields.location || '';
  const linkedin = contactFields.linkedin || '';
  const github = contactFields.github || '';

  const headerLines: string[] = [];
  if (titleLine) headerLines.push(`\\quote{${esc(titleLine)}}`);
  if (phone) headerLines.push(`\\phone[mobile]{${esc(phone)}}`);
  if (email) headerLines.push(`\\email{${esc(email)}}`);
  if (location) headerLines.push(`\\address{${esc(location)}}{}`);
  if (linkedin) {
    const url = linkedin.startsWith('http') ? linkedin : `https://${linkedin}`;
    headerLines.push(`\\social[linkedin]{${esc(url)}}`);
  }
  if (github) {
    const url = github.startsWith('http') ? github : `https://${github}`;
    headerLines.push(`\\social[github]{${esc(url)}}`);
  }

  const body: string[] = [];
  if (sections.summary) {
    body.push(`\\section{Summary}`);
    body.push(`\\cvitem{}{${esc(sections.summary.replace(/\n+/g, ' ').trim())}}`);
  }
  if (sections.skills) {
    body.push(`\\section{Skills}`);
    body.push(formatSkillsLatex(sections.skills));
  }
  if (sections.experience) {
    body.push(`\\section{Professional Experience}`);
    body.push(formatExperienceLatex(sections.experience));
  }
  if (sections.certification) {
    body.push(`\\section{Certification}`);
    body.push(formatSkillsLatex(sections.certification));
  }
  if (sections.education) {
    body.push(`\\section{Education}`);
    body.push(`\\cvitem{}{${esc(sections.education.replace(/\n+/g, ' ').trim())}}`);
  }

  return `\\documentclass[11pt,a4paper,sans]{moderncv}
\\moderncvstyle{casual}
\\moderncvcolor{burgundy}
\\usepackage[scale=0.85]{geometry}
\\usepackage{enumitem}
\\name{${first}}{${last}}
${headerLines.join('\n')}
\\begin{document}
\\makecvtitle
${body.join('\n\n')}
\\end{document}`;
}

function buildModernTwoColumnLatex(
  sections: Record<string, string>,
  contactFields: Record<string, string>,
  first: string,
  last: string,
  targetRole: string,
): string {
  const titleLine = contactFields.title || targetRole || '';
  const email = contactFields.email || '';
  const phone = contactFields.phone || '';
  const location = contactFields.location || '';
  const linkedin = contactFields.linkedin || '';
  const github = contactFields.github || '';

  const leftColumn: string[] = [];
  leftColumn.push(`{\\Huge\\bfseries ${first} ${last}}`);
  if (titleLine) leftColumn.push(`\\vspace{4pt}\n{\\large ${esc(titleLine)}}`);
  leftColumn.push('\\vspace{12pt}');

  if (email || phone || location || linkedin || github) {
    leftColumn.push(`\\textbf{Contact}`);
    leftColumn.push('\\vspace{4pt}');
    if (email) leftColumn.push(`\\href{mailto:${esc(email)}}{${esc(email)}}\\\\`);
    if (phone) leftColumn.push(`${esc(phone)}\\\\`);
    if (location) leftColumn.push(`${esc(location)}\\\\`);
    if (linkedin) {
      const url = linkedin.startsWith('http') ? linkedin : `https://${linkedin}`;
      leftColumn.push(`\\href{${esc(url)}}{LinkedIn}\\\\`);
    }
    if (github) {
      const url = github.startsWith('http') ? github : `https://${github}`;
      leftColumn.push(`\\href{${esc(url)}}{GitHub}\\\\`);
    }
    leftColumn.push('\\vspace{12pt}');
  }

  if (sections.skills) {
    leftColumn.push(`\\textbf{Skills}`);
    leftColumn.push('\\vspace{4pt}');
    const skillLines = sections.skills.split('\n').map((l) => l.trim()).filter(Boolean);
    for (const line of skillLines) {
      if (line.startsWith('- ')) {
        leftColumn.push(`\\textbullet\\ ${esc(line.slice(2).trim())}\\\\`);
      } else {
        leftColumn.push(`\\textbf{${esc(line)}}\\\\`);
      }
    }
    leftColumn.push('\\vspace{12pt}');
  }

  if (sections.education) {
    leftColumn.push(`\\textbf{Education}`);
    leftColumn.push('\\vspace{4pt}');
    leftColumn.push(esc(sections.education.replace(/\n+/g, ' ').trim()));
    leftColumn.push('\\vspace{12pt}');
  }

  if (sections.certification) {
    leftColumn.push(`\\textbf{Certifications}`);
    leftColumn.push('\\vspace{4pt}');
    const certLines = sections.certification.split('\n').map((l) => l.trim()).filter(Boolean);
    for (const line of certLines) {
      if (line.startsWith('- ')) {
        leftColumn.push(`\\textbullet\\ ${esc(line.slice(2).trim())}\\\\`);
      } else {
        leftColumn.push(`\\textbf{${esc(line)}}\\\\`);
      }
    }
    leftColumn.push('\\vspace{12pt}');
  }

  const rightColumn: string[] = [];
  if (sections.summary) {
    rightColumn.push(`\\textbf{Summary}`);
    rightColumn.push('\\vspace{4pt}');
    rightColumn.push(esc(sections.summary.replace(/\n+/g, ' ').trim()));
    rightColumn.push('\\vspace{12pt}');
  }

  if (sections.experience) {
    rightColumn.push(`\\textbf{Professional Experience}`);
    rightColumn.push('\\vspace{4pt}');
    rightColumn.push(formatTwoColumnExperience(sections.experience));
  }

  return `\\documentclass[11pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{sourcesanspro}
\\renewcommand{\\familydefault}{\\sfdefault}
\\usepackage[margin=1.5cm]{geometry}
\\usepackage{paracol}
\\usepackage{titlesec}
\\usepackage{enumitem}
\\usepackage{hyperref}
\\titleformat{\\section}{\\Large\\bfseries}{}{0em}{}[\\titlerule]
\\titlespacing{\\section}{0pt}{12pt}{6pt}
\\setlength{\\parindent}{0pt}
\\setlength{\\parskip}{4pt}
\\columnratio{0.32}
\\begin{document}
\\pagestyle{empty}
\\begin{paracol}{2}
${leftColumn.join('\n')}
\\switchcolumn
${rightColumn.join('\n')}
\\end{paracol}
\\end{document}`;
}

export function buildLatexFromAtsText(raw: string, meta: ResumeLatexMeta = {}): string {
  const text = raw.trim();
  if (!text) {
    throw new Error('ATS optimizer returned empty resume text');
  }

  const nameSection = extractSection(text, 'NAME');
  const contactSection = extractSection(text, 'CONTACT');
  const summarySection = extractSection(text, 'SUMMARY')
    || extractSection(text, 'PROFESSIONAL SUMMARY');
  const skillsSection = extractSection(text, 'SKILLS')
    || extractSection(text, 'TECHNICAL SKILLS');
  const experienceSection = extractSection(text, 'PROFESSIONAL EXPERIENCE');
  const certificationSection = extractSection(text, 'CERTIFICATION')
    || extractSection(text, 'CERTIFICATIONS');
  const educationSection = extractSection(text, 'EDUCATION');

  const contactFields = parseContactFields(contactSection);
  let fullName = nameSection.split('\n').find((l) => l.trim())?.trim() || '';
  if (!fullName && contactFields.name) fullName = contactFields.name;
  if (!fullName) fullName = text.split('\n').find((l) => l.trim() && !/^(NAME|CONTACT|SUMMARY)/i.test(l))?.trim() || 'Your Name';

  const { first, last } = splitName(fullName);

  const sections = {
    summary: summarySection,
    skills: skillsSection,
    experience: experienceSection,
    certification: certificationSection,
    education: educationSection,
  };

  if (!summarySection && !experienceSection) {
    throw new Error(
      'ATS output is missing SUMMARY and PROFESSIONAL EXPERIENCE sections. Expected ALL CAPS headers per ATS format.',
    );
  }

  const template = meta.template || 'classic';
  switch (template) {
    case 'modern_single':
      return buildModernSingleLatex(sections, contactFields, first, last);
    case 'modern_two_column':
      return buildModernTwoColumnLatex(sections, contactFields, first, last, meta.targetRole || '');
    case 'classic':
    default:
      return buildClassicLatex(sections, contactFields, first, last);
  }
}
