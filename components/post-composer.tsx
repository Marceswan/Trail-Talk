'use client';
import {useRef,useState} from 'react';
import {Check,FilePenLine,LoaderCircle,Plus} from 'lucide-react';
import type {Community,FeedData,Profile} from '@/lib/types';
import {topics} from '@/lib/feed-navigation';
import {canPublishPost, ANNOUNCEMENTS, ANNOUNCEMENT_TOPIC} from '@/lib/post-permissions';
import {Dialog} from './dialog';
import {TagField} from './tag-field';
import {normalizePostTags} from '@/lib/post-tags';
import {MarkdownEditor} from './markdown-editor';
import {usePostDraft} from './use-post-draft';

type Props={profile:Profile; communities:Community[]; initialCommunity:string; initialTopic:string; onClose:()=>void; onSignIn:()=>void; onPublished:(data:FeedData,tag:string,warning:string)=>void};
export function PostComposer({profile,communities,initialCommunity,initialTopic,onClose,onSignIn,onPublished}:Props) {
  const availableCommunities=communities.filter(c=>canPublishPost(profile.role,c.id,'Discussion'));
  const availableTopics=topics.slice(1).filter(t=>canPublishPost(profile.role,'salesforce',t));
  const saved=usePostDraft(profile.email!,{title:'',body:'',community:availableCommunities.some(c=>c.id===initialCommunity)?initialCommunity:'salesforce',tag:availableTopics.includes(initialTopic)?initialTopic:'Discussion'});
  const [busy,setBusy]=useState(false), [error,setError]=useState(''), [needsSignIn,setNeedsSignIn]=useState(false);
  const [confirm,setConfirm]=useState<'discard'|'close'|'signin'|null>(null);
  const sending=useRef(false);
  const titleRef=useRef<HTMLInputElement>(null);
  const {draft,status}=saved;
  const allowed=canPublishPost(profile.role,draft.community,draft.tag);
  function close(action:'close'|'signin'='close') {
    if(sending.current)return;
    if(saved.unsaved){setConfirm(action);return;}
    if(action==='signin')onSignIn();else onClose();
  }
  const statusText=status==='restored'?'Draft restored from this browser.':status==='saved'?'Draft saved in this browser.':status==='error'?'Browser storage is unavailable. Your latest changes are not saved.':status==='conflict'?'The saved draft changed in another tab. Your writing here is still intact.':status==='invalid'?'The previous browser draft could not be restored. You can start a new post.':'Your draft saves automatically as you write.';
  return <Dialog title="Start a conversation" subtitle="A question, an idea, a small win. It all belongs here." onClose={()=>close()}>
    {!saved.ready?<p className="draft-loading" role="status">Loading your draft…</p>:<form className="post-form" onSubmit={async e=>{
      e.preventDefault();if(sending.current||status==='conflict'||!allowed)return;
      sending.current=true;setBusy(true);setError('');setNeedsSignIn(false);
      try {
        const response=await fetch('/api/community',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'post',...draft,tags:normalizePostTags((draft.tagsText||'').split(',')),expectedAccount:profile.email})});
        const result=await response.json();
        if(!response.ok){setNeedsSignIn(response.status===401);throw new Error(result.error||'Your post could not be published. Your draft is still here.');}
        onPublished(result,draft.tag,saved.clearPublished());
      } catch(cause){setError(cause instanceof Error?cause.message:'Your post could not be published. Your draft is still here.');}
      finally{sending.current=false;setBusy(false);}
    }}>
      <div className={`draft-status ${status==='error'||status==='conflict'?'draft-warning':''}`}>
        <div role="status">{status==='saved'||status==='restored'?<Check size={15}/>:<FilePenLine size={15}/>}<span>{statusText}</span></div>
        <p>Saved for this account on this browser only. Drafts are not encrypted or synced across devices.</p>
        {status==='error'&&<button type="button" className="text-button" disabled={busy} onClick={saved.retry}>Retry saving draft</button>}
        {status==='conflict'&&<div className="draft-actions"><button type="button" className="text-button" disabled={busy} onClick={saved.restore}>Load saved version</button><button type="button" className="text-button" disabled={busy} onClick={saved.keepMine}>Keep this version</button></div>}
      </div>
      <fieldset disabled={busy} className="composer-fields">
        <div className="form-row"><label>Community<select aria-label="Community" name="community" value={draft.community} onChange={e=>saved.update({community:e.target.value,...(e.target.value===ANNOUNCEMENTS?{tag:ANNOUNCEMENT_TOPIC}:{})})}>{!availableCommunities.some(c=>c.id===draft.community)&&<option value={draft.community} disabled>Choose an available community</option>}{availableCommunities.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Topic<select aria-label="Topic" name="tag" value={draft.tag} onChange={e=>saved.update({tag:e.target.value})}>{!availableTopics.includes(draft.tag)&&<option value={draft.tag} disabled>Choose an available topic</option>}{availableTopics.map(t=><option key={t}>{t}</option>)}</select></label></div>
        {!allowed&&<p className="form-error" role="alert">Only admins and moderators can publish announcements. Choose another community and topic to publish this draft.</p>}
        <label>Title<input ref={titleRef} name="title" required minLength={5} maxLength={180} value={draft.title} onChange={e=>saved.update({title:e.target.value})} placeholder="Give your conversation a good starting point"/></label>
        <MarkdownEditor label="Your post" name="body" required minLength={10} maxLength={10000} rows={7} value={draft.body} disabled={busy} onChange={body=>saved.update({body})} placeholder="Share a little context. What have you tried? What did you learn?"/>
        <TagField value={draft.tagsText||''} onChange={tagsText=>saved.update({tagsText})}/>
      </fieldset>
      <div className="posting-as"><span className="avatar profile-avatar">{profile.name.split(' ').map(s=>s[0]).join('').slice(0,2).toUpperCase()}</span><span>Posting as <strong>{profile.name}</strong></span></div>
      {error&&<div className="form-error" role="alert"><p>{error}</p>{needsSignIn&&<button type="button" className="text-button" onClick={()=>close('signin')}>Sign in to publish</button>}</div>}
      {confirm&&<section className="draft-confirm" role="alert" aria-label="Confirm draft action"><p>{confirm==='discard'?'Discard this draft? This removes its saved copy from this browser.':'Your latest changes are not saved. Closing will lose those changes.'}</p><div className="draft-actions"><button type="button" className="secondary-button" onClick={()=>{setConfirm(null);titleRef.current?.focus();}}>Keep writing</button><button type="button" className="text-button" onClick={()=>{if(confirm==='discard'){if(saved.discard()){setConfirm(null);setError('');titleRef.current?.focus();}else setConfirm(null);}else if(confirm==='signin')onSignIn();else onClose();}}>{confirm==='discard'?'Discard draft':'Close without saving'}</button></div></section>}
      <div className="dialog-footer"><button type="button" className="text-button discard-draft" disabled={busy||!saved.hasText||status==='conflict'} onClick={()=>setConfirm('discard')}>Discard draft</button><button className="primary-button" disabled={busy||status==='conflict'||!allowed||!availableCommunities.some(c=>c.id===draft.community)}>{busy?<LoaderCircle size={16} className="spin"/>:<Plus size={16}/>}Publish post</button></div>
    </form>}
  </Dialog>;
}
