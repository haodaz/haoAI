/**
 * Agent config titles are stored as "中文 / English" (e.g. "方案架构师 / Proposal Architect").
 * The UI is English-only, so show the English half.
 */
export function agentTitleEn(title: string | undefined): string {
  if (!title) return '';
  const parts = title.split('/').map(s => s.trim()).filter(Boolean);
  const en = parts.find(p => !/[一-鿿]/.test(p));
  return en || parts[0] || '';
}
