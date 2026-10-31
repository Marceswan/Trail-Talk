'use client';
import {useId} from 'react';
import {tagSuggestions} from '@/lib/post-tags';
export function TagField({value,defaultValue,onChange}:{value?:string;defaultValue?:string;onChange?:(value:string)=>void}) {
  const id=useId();
  return <label className="tag-field">Tags <span className="optional-label">(optional)</span><input name="tags" aria-label="Tags" aria-describedby={`${id}-hint`} value={value} defaultValue={defaultValue} onChange={onChange?e=>onChange(e.target.value):undefined} maxLength={180} placeholder="e.g. flow, health-cloud, automation" list={`${id}-suggestions`}/><datalist id={`${id}-suggestions`}>{tagSuggestions.map(tag=><option key={tag} value={tag}/>)}</datalist><small id={`${id}-hint`}>Up to 5 tags, separated by commas. Use letters, numbers, or hyphens.</small></label>;
}
