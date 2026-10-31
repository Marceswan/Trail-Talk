export const tagSuggestions = ['flow', 'apex', 'lwc', 'agentforce', 'slack', 'financial-services', 'health-cloud', 'education', 'nonprofit', 'manufacturing', 'energy-utilities', 'public-sector', 'automotive', 'consumer-goods', 'communications', 'media', 'life-sciences'];
export function normalizePostTags(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 20 || value.some(tag => typeof tag !== 'string' || tag.length > 60)) throw new Error('Use up to 5 tags, each 1–30 letters, numbers, or hyphens.');
  const tags = [...new Set((value as string[]).map(tag => tag.trim().toLowerCase().replace(/[\s_]+/g, '-')).filter(Boolean))];
  if (tags.length > 5 || tags.some(tag => !/^[a-z0-9][a-z0-9-]{0,29}$/.test(tag))) throw new Error('Use up to 5 tags, each 1–30 letters, numbers, or hyphens.');
  return tags;
}
