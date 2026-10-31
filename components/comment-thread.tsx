'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, BadgeCheck, MessageCircle as MessageCircleIcon, ChevronDown, ChevronRight, PencilLine, Reply, Send } from 'lucide-react';
import { RichText } from './rich-text';
import { MarkdownEditor } from './markdown-editor';
import { markdownExcerpt } from '@/lib/markdown';
import type { Comment } from '@/lib/types';

type Props = {
  comments:Comment[]; count:number; loading:boolean; error:string; formError:string;
  busy:boolean; locked:boolean; signedIn:boolean; suspended:boolean; name:string;
  question?:{acceptedCommentId:number|null;owned:boolean;author:string};
  onAccept?:(commentId:number|null)=>Promise<boolean>;
  onSignIn:()=>void; onRetry:()=>void; onReport:(id:number)=>void;
  onVote:(comment:Comment,value:number)=>void;
  onEdit:(comment:Comment,body:string)=>Promise<boolean>;
  onSubmit:(body:string,parentId:number|null)=>Promise<boolean>;
};
function relativeTime(timestamp:number) {
  const minutes=Math.max(0,Math.floor((Date.now()-timestamp)/60000));
  return minutes<1?'just now':minutes<60?`${minutes}m ago`:minutes<1440?`${Math.floor(minutes/60)}h ago`:`${Math.floor(minutes/1440)}d ago`;
}
export function CommentThread(props:Props) {
  const {comments,count,loading,error,formError,busy,locked,signedIn,suspended,name,onSignIn,onRetry,onReport,onVote,onEdit,onSubmit,question,onAccept}=props;
  const [sort,setSort]=useState('new');
  const [answerError,setAnswerError]=useState('');
  const [linkedComment,setLinkedComment]=useState<number|null>(null);
  useEffect(()=>{
    const sync=()=>setLinkedComment(/^#comment-\d+$/.test(window.location.hash)?Number(window.location.hash.slice(9)):null);
    sync();window.addEventListener('hashchange',sync);return()=>window.removeEventListener('hashchange',sync);
  },[]);
  const [collapsed,setCollapsed]=useState<Set<number>>(new Set());
  const [replyTo,setReplyTo]=useState<number|null>(null);
  const [drafts,setDrafts]=useState<Record<number,string>>({});
  const [commentDraft,setCommentDraft]=useState('');
  const [editing,setEditing]=useState<Comment|null>(null);
  const [editDraft,setEditDraft]=useState('');
  const children=useMemo(()=>{
    const grouped=new Map<number|null,Comment[]>();
    for(const comment of comments){const list=grouped.get(comment.parent_id)||[];list.push(comment);grouped.set(comment.parent_id,list);}
    const chronological=(a:Comment,b:Comment)=>a.created_at-b.created_at||a.id-b.id;
    for(const list of grouped.values())list.sort((a,b)=>sort==='top'?b.score-a.score||chronological(b,a):sort==='old'?chronological(a,b):chronological(b,a));
    return grouped;
  },[comments,sort]);
  const canComment=signedIn&&!locked&&!suspended;
  const accepted=question?.acceptedCommentId?comments.find(c=>c.id===question.acceptedCommentId&&!c.removed):undefined;
  const canAccept=Boolean(question?.owned)&&canComment;
  function reveal(id:number){
    const byId=new Map(comments.map(c=>[c.id,c]));const ancestors=new Set<number>();let parent=byId.get(id)?.parent_id;
    while(parent!=null&&!ancestors.has(parent)){ancestors.add(parent);parent=byId.get(parent)?.parent_id;}
    setCollapsed(previous=>{if(![...ancestors].some(parent=>previous.has(parent)))return previous;const next=new Set(previous);ancestors.forEach(parent=>next.delete(parent));return next;});
  }
  useEffect(()=>{
    if(linkedComment===null||loading)return;
    reveal(linkedComment);
    const timer=requestAnimationFrame(()=>document.getElementById(`comment-${linkedComment}`)?.scrollIntoView({block:'center'}));
    return()=>cancelAnimationFrame(timer);
  },[linkedComment,loading,comments.length]);
  function jumpToAnswer(id:number){
    reveal(id);setLinkedComment(id);
    if(window.location.hash!==`#comment-${id}`)window.history.pushState(null,'',`#comment-${id}`);
    requestAnimationFrame(()=>{const target=document.getElementById(`comment-${id}`);target?.scrollIntoView({block:'center'});target?.focus({preventScroll:true});});
  }
  async function chooseAnswer(id:number|null){
    setAnswerError('');if(onAccept&&!await onAccept(id))setAnswerError('The accepted answer could not be changed. Your previous selection is unchanged.');
  }
  function countReplies(id:number):number {return (children.get(id)||[]).reduce((total,c)=>total+1+countReplies(c.id),0);}
  function renderComment(comment:Comment,depth=0):React.ReactNode {
    const replies=children.get(comment.id)||[];const hidden=collapsed.has(comment.id);const total=countReplies(comment.id);
    return <div className="comment-branch" key={comment.id} data-comment-id={comment.id}>
      <article className={`comment ${comment.removed?'comment-removed':''} ${linkedComment===comment.id?'is-linked':''} ${accepted?.id===comment.id?'is-accepted':''}`} tabIndex={-1} id={`comment-${comment.id}`}>
        <span className={`avatar avatar-${comment.id%4}`} aria-hidden="true">{comment.author.split(' ').map(n=>n[0]).join('').slice(0,2)}</span>
        <div className="comment-content"><div className="comment-meta"><strong>{comment.author_id?<Link className="author-link" href={`/members/${comment.author_id}`}>{comment.author}</Link>:comment.author}</strong>{accepted?.id===comment.id&&<span className="accepted-badge"><BadgeCheck size={13}/>Accepted answer</span>}<a href={`#comment-${comment.id}`} className="comment-time" aria-label={`Link to comment by ${comment.author}`}><time dateTime={new Date(comment.created_at).toISOString()} title={new Date(comment.created_at).toLocaleString()}>{relativeTime(comment.created_at)}</time></a>{comment.edited_at&&<span className="edited-label" title={new Date(comment.edited_at).toLocaleString()}>edited</span>}</div>
          {editing?.id===comment.id?<form className="reply-form edit-comment-form" onSubmit={async e=>{e.preventDefault();setAnswerError('');if(await onEdit(editing,editDraft))setEditing(null);}}><MarkdownEditor label="Edit your comment" id={`edit-comment-${comment.id}`} autoFocus required maxLength={4000} rows={3} value={editDraft} onChange={setEditDraft}/><div className="reply-form-actions"><button type="button" className="text-button" onClick={()=>setEditing(null)}>Cancel edit</button><button className="primary-button" disabled={busy||!editDraft.trim()}>Save changes</button></div>{formError&&<p className="form-error" role="alert">{formError}</p>}</form>:<RichText className="comment-body" body={comment.body}/>}
          <div className="comment-tools">{!comment.removed&&<>
            <div className={`vote-control comment-votes ${comment.vote?'voted':''}`} role="group" aria-label={`Vote on comment by ${comment.author}`}><button aria-label={`Upvote comment by ${comment.author}`} aria-pressed={comment.vote===1} disabled={busy||suspended} onClick={()=>onVote(comment,comment.vote===1?0:1)}><ArrowUp size={14}/></button><span className="comment-score" aria-label="Comment score" aria-live="polite">{comment.score}</span><button aria-label={`Downvote comment by ${comment.author}`} aria-pressed={comment.vote===-1} disabled={busy||suspended} onClick={()=>onVote(comment,comment.vote===-1?0:-1)}><ArrowDown size={14}/></button></div>
            {!locked&&!suspended&&depth<5&&<button className="comment-reply-button" aria-label={`Reply to ${comment.author}`} aria-expanded={replyTo===comment.id} onClick={()=>{if(!signedIn){onSignIn();return;}setReplyTo(replyTo===comment.id?null:comment.id);}}><Reply size={13}/>Reply</button>}
            {Boolean(comment.owned)&&canComment&&<button className="comment-reply-button" aria-label="Edit your comment" onClick={()=>{setEditing(comment);setEditDraft(comment.body);setReplyTo(null);}}><PencilLine size={13}/>Edit</button>}{canAccept&&<button type="button" className="accept-answer-button" disabled={busy} aria-label={accepted?.id===comment.id?`Remove accepted answer by ${comment.author}`:`Accept answer by ${comment.author}`} onClick={()=>void chooseAnswer(accepted?.id===comment.id?null:comment.id)}><BadgeCheck size={13}/>{accepted?.id===comment.id?'Remove acceptance':'Accept answer'}</button>}<button className="comment-report text-button" onClick={()=>onReport(comment.id)} aria-label={`Report comment by ${comment.author}`}>Report</button>
          </>}{replies.length>0&&<button className="collapse-replies" aria-expanded={!hidden} aria-label={`${hidden?'Expand':'Collapse'} replies to ${comment.author}`} onClick={()=>setCollapsed(previous=>{const next=new Set(previous);if(next.has(comment.id))next.delete(comment.id);else next.add(comment.id);return next;})}>{hidden?<ChevronRight size={13}/>:<ChevronDown size={13}/>} {total} {total===1?'reply':'replies'}</button>}</div>
          {replyTo===comment.id&&canComment&&!comment.removed&&<form className="reply-form" onSubmit={async e=>{e.preventDefault();setAnswerError('');if(await onSubmit(drafts[comment.id]||'',comment.id)){setDrafts(previous=>({...previous,[comment.id]:''}));setReplyTo(null);setCollapsed(previous=>{const next=new Set(previous);next.delete(comment.id);return next;});}}}>
            <MarkdownEditor label={`Your reply to ${comment.author}`} id={`reply-${comment.id}`} autoFocus required maxLength={4000} rows={3} value={drafts[comment.id]||''} onChange={value=>setDrafts({...drafts,[comment.id]:value})} placeholder="Keep the conversation going…"/>
            <div className="reply-form-actions"><button type="button" className="text-button" onClick={()=>setReplyTo(null)}>Cancel reply</button><button className="primary-button" disabled={busy||!drafts[comment.id]?.trim()}><Send size={13}/>Post reply</button></div>
            {formError&&<p className="form-error" role="alert">{formError}</p>}
          </form>}
        </div>
      </article>
      {!hidden&&replies.length>0&&<div className={`comment-replies ${depth>=2?'shallow-indent':''}`}>{replies.map(reply=>renderComment(reply,depth+1))}</div>}
    </div>;
  }
  return <section className="thread-comments" id="comments">{question&&(accepted?<aside className="accepted-summary" aria-label="Accepted answer summary"><div className="accepted-summary-heading"><BadgeCheck size={20}/><div><h3>Accepted answer</h3><span>Chosen by {question.author}</span></div></div><p>{markdownExcerpt(accepted.body,240)}</p><div className="accepted-summary-footer"><span>From <strong>{accepted.author}</strong></span><a href={`#comment-${accepted.id}`} onClick={e=>{e.preventDefault();jumpToAnswer(accepted.id);}}>Jump to answer <ChevronDown size={14}/></a></div></aside>:!question.acceptedCommentId&&<div className="open-question-note"><MessageCircleIcon/><p>{question.owned?'When a reply solves your question, mark it as the accepted answer.':'This question is open. Share an answer that helps.'}</p></div>)}{answerError&&<p className="form-error answer-error" role="alert">{formError||answerError}</p>}<div className="conversation-toolbar"><h3>Join the conversation <span className="count-pill">{count}</span></h3><label className="comment-sort">Sort<select aria-label="Sort comments" value={sort} onChange={e=>setSort(e.target.value)}><option value="new">Newest</option><option value="top">Top voted</option><option value="old">Oldest</option></select></label></div>
    {locked?<p className="account-banner">This conversation is locked. You can still read and vote.</p>:suspended?<p className="account-banner">Your account is suspended. You can still read the conversation.</p>:!signedIn?<p className="account-banner"><button className="text-button" onClick={onSignIn}>Sign in</button> to join the conversation.</p>:<form className="new-comment-form" onSubmit={async e=>{e.preventDefault();setAnswerError('');if(await onSubmit(commentDraft,null))setCommentDraft('');}}><MarkdownEditor label="Your comment" hideLabel name="comment" rows={3} required maxLength={4000} placeholder="Add your perspective…" value={commentDraft} onChange={setCommentDraft}/><div className="comment-submit"><span>Posting as {name}</span><button className="primary-button" disabled={busy||!commentDraft.trim()}><Send size={14}/>Comment</button></div>{formError&&replyTo===null&&!editing&&!answerError&&<p className="form-error" role="alert">{formError}</p>}</form>}
    {loading?<p className="comment-status">Loading the conversation…</p>:error?<div className="comment-status"><p>{error}</p><button className="text-button" onClick={onRetry}>Try again</button></div>:comments.length===0?<p className="comment-status">Be the first to share a thought.</p>:<div className="comments-list">{(children.get(null)||[]).map(comment=>renderComment(comment))}</div>}
  </section>;
}
