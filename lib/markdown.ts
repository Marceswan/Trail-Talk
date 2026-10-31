import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
const parser=unified().use(remarkParse).use(remarkGfm);
type TextNode={type:string;value?:string;alt?:string|null;children?:TextNode[]};
function plain(node:TextNode):string {
  if(node.type==='html'||node.type==='definition'||node.type==='footnoteDefinition')return '';
  if(node.type==='image')return node.alt||'';
  if(node.value!==undefined)return node.value;
  const separator=['root','list','listItem','blockquote','table','tableRow','footnoteDefinition'].includes(node.type)?' ':'';
  return (node.children||[]).map(plain).join(separator);
}
export function markdownExcerpt(source:string,max=400) {
  const text=plain(parser.parse(source)).replace(/\s+/g,' ').trim();
  return text.length>max?`${text.slice(0,max).trimEnd()}…`:text;
}
