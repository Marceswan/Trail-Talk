'use client';
import {useEffect, useRef, useState} from 'react';
import {topics} from '@/lib/feed-navigation';

export type PostDraft = {title:string; body:string; community:string; tag:string};
type Status = 'empty' | 'saved' | 'restored' | 'error' | 'conflict' | 'invalid';
export const draftKey = (account:string) => `trailtalk-post-draft:v1:${encodeURIComponent(account.toLowerCase())}`;
const hasText = (draft:PostDraft) => Boolean(draft.title || draft.body);
function parseDraft(raw:string|null):PostDraft|null {
  if (!raw) return null;
  try {
    const value=JSON.parse(raw);
    if (value.version!==1 || typeof value.title!=='string' || value.title.length>180 || typeof value.body!=='string' || value.body.length>10000 || typeof value.community!=='string' || !value.community || value.community.length>40 || !topics.slice(1).includes(value.tag)) return null;
    return {title:value.title, body:value.body, community:value.community, tag:value.tag};
  } catch { return null; }
}

export function usePostDraft(account:string, initial:PostDraft) {
  const key=draftKey(account);
  const defaults=useRef(initial);
  const [draft,setDraft]=useState(initial);
  const [ready,setReady]=useState(false);
  const [status,setStatus]=useState<Status>('empty');
  // The last storage value we observed; undefined means storage could not be read.
  const baseline=useRef<string|null|undefined>(undefined);
  const current=useRef(initial);

  function restore() {
    try {
      const raw=localStorage.getItem(key), restored=parseDraft(raw);
      baseline.current=raw;
      current.current=restored||defaults.current;
      setDraft(current.current);
      setStatus(restored?'restored':raw?'invalid':'empty');
    } catch {setStatus('error');}
    setReady(true);
  }
  useEffect(()=>{
    restore();
    const changed=(event:StorageEvent)=>{
      if (event.storageArea!==localStorage || (event.key!==key && event.key!==null)) return;
      if (event.newValue!==baseline.current) setStatus('conflict');
    };
    window.addEventListener('storage',changed);
    return()=>window.removeEventListener('storage',changed);
    // The composer is keyed by account and captures its initial community on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[key]);

  function save(next:PostDraft, replace=false) {
    try {
      const raw=localStorage.getItem(key);
      if (!replace && raw!==(baseline.current??null)) {setStatus('conflict');return false;}
      const serialized=hasText(next)?JSON.stringify({...next,version:1,updatedAt:Date.now(),revision:crypto.randomUUID()}):null;
      if (serialized===null) localStorage.removeItem(key);else localStorage.setItem(key,serialized);
      baseline.current=serialized;
      setStatus(serialized?'saved':'empty');
      return true;
    } catch {setStatus('error');return false;}
  }
  function update(patch:Partial<PostDraft>) {
    const next={...current.current,...patch};current.current=next;setDraft(next);
    if(status!=='conflict')save(next);
  }
  function discard() {
    if(!save(defaults.current))return false;
    current.current=defaults.current;setDraft(defaults.current);return true;
  }
  function clearPublished() {
    try {
      // A different tab's newer draft must survive publication of this version.
      if (baseline.current!==undefined && localStorage.getItem(key)===baseline.current) localStorage.removeItem(key);
      return '';
    } catch {return 'Your post is live, but its browser draft could not be cleared. Discard it when browser storage is available.';}
  }
  const unsaved=hasText(draft) && (status==='error'||status==='conflict');
  useEffect(()=>{
    if(!unsaved)return;
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
    window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
  },[unsaved]);
  return {draft,ready,status,unsaved,hasText:hasText(draft),update,discard,restore,clearPublished,retry:()=>save(current.current),keepMine:()=>save(current.current,true)};
}
