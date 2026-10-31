import { markdownExcerpt } from './markdown';
export function searchTerms(query:string):string[] {
  return [...new Set(Array.from(query.trim().matchAll(/"([^"]+)"|(\S+)/g),m=>(m[1]||m[2]).toLowerCase()).filter(Boolean))];
}
export function searchSnippet(source:string,terms:string[],length=220):string {
  const text=markdownExcerpt(source,Number.MAX_SAFE_INTEGER);const lower=text.toLowerCase();
  const positions=terms.map(term=>lower.indexOf(term)).filter(index=>index>=0);const first=positions.length?Math.min(...positions):0;
  const start=Math.max(0,first-60);const end=Math.min(text.length,start+length);
  return `${start?'…':''}${text.slice(start,end).trim()}${end<text.length?'…':''}`;
}
