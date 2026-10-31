'use client';
import { useEffect, useId, useLayoutEffect, useRef, useState, type TextareaHTMLAttributes } from 'react';
import { Bold, Code2, Italic, Link2, List, Quote } from 'lucide-react';
import { RichText } from './rich-text';

type Props=Omit<TextareaHTMLAttributes<HTMLTextAreaElement>,'value'|'defaultValue'|'onChange'> & {
  label:string;value?:string;defaultValue?:string;onChange?:(value:string)=>void;hideLabel?:boolean;
};
export function MarkdownEditor({label,value,defaultValue='',onChange,hideLabel=false,id, maxLength=4000, ...props}:Props){
  const generated=useId();const fieldId=id||generated;
  const [draft,setDraft]=useState(defaultValue);const [preview,setPreview]=useState(false);const [message,setMessage]=useState('');
  const ref=useRef<HTMLTextAreaElement>(null);const selection=useRef<{start:number;end:number}|null>(null);const text=value??draft;
  useLayoutEffect(()=>{const next=selection.current;if(next&&ref.current){ref.current.focus();ref.current.setSelectionRange(next.start,next.end);selection.current=null;}},[text]);
  useEffect(()=>{if(!text)setPreview(false);},[text]);
  function update(next:string){setDraft(next);onChange?.(next);setMessage('');}
  function insert(before:string,after='',placeholder='text'){
    const field=ref.current;if(!field)return;
    const start=field.selectionStart,end=field.selectionEnd,selected=text.slice(start,end)||placeholder;
    const next=text.slice(0,start)+before+selected+after+text.slice(end);
    if(next.length>maxLength){setMessage('This formatting would exceed the character limit.');return;}
    selection.current={start:start+before.length,end:start+before.length+selected.length};update(next);
  }
  const formats=[{label:'Bold',Icon:Bold,before:'**',after:'**',sample:'bold text'},{label:'Italic',Icon:Italic,before:'*',after:'*',sample:'italic text'},{label:'Add link',Icon:Link2,before:'[',after:'](https://example.com)',sample:'link text'},{label:'Bulleted list',Icon:List,before:'\n- ',after:'\n',sample:'List item'},{label:'Quote',Icon:Quote,before:'\n> ',after:'\n',sample:'Quoted text'},{label:'Code block',Icon:Code2,before:'\n```apex\n',after:'\n```\n',sample:'// Paste your code here'}];
  return <div className="markdown-field"><label className={hideLabel?'sr-only':'markdown-label'} htmlFor={fieldId}>{label}</label><div className="markdown-editor"><div className="editor-toolbar"><div className="editor-modes" role="group" aria-label={`${label} mode`}><button type="button" aria-pressed={!preview} onClick={()=>{setPreview(false);requestAnimationFrame(()=>ref.current?.focus());}}>Write</button><button type="button" aria-pressed={preview} onClick={()=>setPreview(true)}>Preview</button></div><div className="editor-formatting" role="group" aria-label={`Format ${label.toLowerCase()}`}>{formats.map(({label,Icon,before,after,sample})=><button key={label} type="button" aria-label={label} title={label} disabled={preview||props.disabled} onMouseDown={e=>e.preventDefault()} onClick={()=>insert(before,after,sample)}><Icon size={14}/></button>)}</div></div>
    <textarea {...props} id={fieldId} ref={ref} value={text} maxLength={maxLength} hidden={preview} aria-describedby={`${fieldId}-help`} onChange={e=>update(e.target.value)} onInvalid={e=>{if(preview){e.preventDefault();setPreview(false);requestAnimationFrame(()=>{ref.current?.focus();ref.current?.reportValidity();});}}} onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&['b','i'].includes(e.key.toLowerCase())){e.preventDefault();const marker=e.key.toLowerCase()==='b'?'**':'*';insert(marker,marker);}}}/>
    {preview&&<div className="editor-preview" role="region" aria-label={`${label} preview`}>{text.trim()?<RichText body={text}/>:<p className="preview-empty">Your formatted text will appear here.</p>}</div>}
    <div className="editor-footer"><details id={`${fieldId}-help`}><summary>Formatting help</summary><div><p><code>**bold**</code> · <code>*italic*</code> · <code>`inline code`</code></p><p>Use <code>- </code> for lists, <code>&gt; </code> for quotes, and <code>[text](https://…)</code> for links.</p><p>Wrap code in three backticks. Add a language, such as <code>apex</code>, after the opening backticks.</p><p>HTML and embedded images are not displayed.</p></div></details><span className={text.length>=maxLength?'at-limit':''} aria-label={`${text.length} of ${maxLength} characters`}>{text.length.toLocaleString()} / {maxLength.toLocaleString()}</span></div>
  </div>{message&&<p className="editor-message" role="status">{message}</p>}</div>;
}
