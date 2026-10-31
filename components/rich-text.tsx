'use client';
import { Children, isValidElement, useEffect, useRef, useState, type ReactNode } from 'react';
import Markdown, {type Components} from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy } from 'lucide-react';

export function safeMarkdownUrl(value:string) {
  if(/[\u0000-\u0020\u007f\\]/.test(value))return '';
  if(/^https?:\/\//i.test(value)||/^mailto:/i.test(value)||/^\/(?!\/)/.test(value)||value.startsWith('#'))return value;
  return '';
}
function textContent(children:ReactNode):string {
  return Children.toArray(children).map(child=>typeof child==='string'||typeof child==='number'?String(child):isValidElement<{children?:ReactNode}>(child)?textContent(child.props.children):'').join('');
}
function CodeBlock({children}:{children:ReactNode}) {
  const [status,setStatus]=useState('');const codeRef=useRef<HTMLPreElement>(null);
  const child=Children.toArray(children)[0];
  const language=isValidElement<{className?:string}>(child)?(child.props.className||'').replace(/^language-/,'').slice(0,30):'';
  useEffect(()=>{if(status!=='Copied')return;const timer=setTimeout(()=>setStatus(''),2500);return()=>clearTimeout(timer);},[status]);
  async function copy(){try{await navigator.clipboard.writeText(textContent(children).replace(/\n$/,''));setStatus('Copied');}catch{setStatus('Select the code to copy it.');codeRef.current?.focus();}}
  return <div className="code-block"><div className="code-toolbar"><span>{language||'Code'}</span><button type="button" onClick={()=>void copy()} aria-label="Copy code">{status==='Copied'?<Check size={13}/>:<Copy size={13}/>}<span>{status==='Copied'?'Copied':'Copy'}</span></button></div><pre ref={codeRef} tabIndex={0} aria-label={`${language||'Code'} code block`}>{children}</pre><span className={status&&status!=='Copied'?'code-copy-error':'sr-only'} role="status">{status}</span></div>;
}
const components:Components={
  pre:({children})=><CodeBlock>{children}</CodeBlock>,
  a:({href,children})=>href?<a href={href} target={/^https?:/i.test(href)?'_blank':undefined} rel="noopener noreferrer nofollow ugc">{children}</a>:<span>{children}</span>,
  img:({alt})=><span className="image-description">[Image: {alt||'no description'}]</span>,
  h1:({children})=><h3>{children}</h3>,h2:({children})=><h3>{children}</h3>,
  table:({children})=><div className="markdown-table" tabIndex={0} role="region" aria-label="Table, scroll horizontally"><table>{children}</table></div>,
};
export function RichText({body,className=''}:{body:string;className?:string}) {
  return <div className={`rich-text ${className}`}><Markdown remarkPlugins={[remarkGfm]} skipHtml urlTransform={safeMarkdownUrl} components={components}>{body}</Markdown></div>;
}
