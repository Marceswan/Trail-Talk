'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Bell, Check, CheckCheck, Cloud, LoaderCircle, MessageCircle, RefreshCw } from 'lucide-react';
import type { InboxData, InboxItem } from '@/lib/types';
import { AccountPanel } from './account-panel';

export function Inbox() {
  const [data,setData]=useState<InboxData>({items:[],unread:0,nextCursor:null});
  const [unreadOnly,setUnreadOnly]=useState(false);
  const [signedOut,setSignedOut]=useState(false);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const requestId=useRef(0);
  const load=useCallback(async(before?:number)=>{
    const id=++requestId.current;setLoading(true);setError('');
    try{
      const params=new URLSearchParams();if(unreadOnly)params.set('unread','1');if(before)params.set('before',String(before));
      const r=await fetch(`/api/notifications?${params}`);const result=await r.json();
      if(id!==requestId.current)return;
      if(r.status===401){setSignedOut(true);setData({items:[],unread:0,nextCursor:null});return;}
      if(!r.ok)throw new Error(result.error||'Your inbox could not load.');
      setSignedOut(false);setData(previous=>({...result,items:before?[...previous.items,...result.items.filter((item:InboxItem)=>!previous.items.some(old=>old.id===item.id))]:result.items}));
    }catch(e){if(id===requestId.current)setError(e instanceof Error?e.message:'Your inbox could not load.');}
    finally{if(id===requestId.current)setLoading(false);}
  },[unreadOnly]);
  useEffect(()=>{void load();return()=>{requestId.current++;};},[load]);
  async function markRead(item?:InboxItem){
    if(busy)return;setBusy(true);setError('');
    try{
      const r=await fetch('/api/notifications',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(item?{action:'read',id:item.id}:{action:'readAll'})});
      const result=await r.json();if(!r.ok)throw new Error(result.error||'Could not update your inbox.');
      if(item)setData(previous=>({...previous,unread:Math.max(0,previous.unread-(item.read_at?0:1)),items:unreadOnly?previous.items.filter(n=>n.id!==item.id):previous.items.map(n=>n.id===item.id?{...n,read_at:Date.now()}:n)}));
      else await load();
    }catch(e){setError(e instanceof Error?e.message:'Could not update your inbox.');}
    finally{setBusy(false);}
  }
  return <main className="inbox-shell" id="main-content"><Link href="/" className="inbox-brand"><Cloud size={26}/>trailtalk<span>.</span></Link><Link href="/" className="back-to-feed"><ArrowLeft size={16}/>Back to feed</Link>
    <header className="inbox-heading"><span className="inbox-symbol"><Bell size={25}/></span><div><h1>Inbox {data.unread>0&&<span className="count-pill">{data.unread} unread</span>}</h1><p>Replies to your comments. Conversations you’ve started.</p></div></header>
    {signedOut?<section className="inbox-signin"><h2>Your conversations, in one place.</h2><p>Sign in to see when someone joins the discussion.</p><AccountPanel onDone={()=>void load()}/></section>:<>
      <div className="inbox-toolbar"><div className="inbox-tabs" role="group" aria-label="Inbox filter"><button aria-pressed={!unreadOnly} onClick={()=>setUnreadOnly(false)}>All activity</button><button aria-pressed={unreadOnly} onClick={()=>setUnreadOnly(true)}>Unread</button></div><div className="inbox-tools"><button className="text-button" disabled={busy||loading||!data.unread} onClick={()=>void markRead()}><CheckCheck size={16}/>Mark all read</button><button className="icon-button" aria-label="Refresh inbox" disabled={loading||busy} onClick={()=>void load()}><RefreshCw size={16}/></button></div></div>
      {error&&<div className="inbox-error" role="alert"><p>{error}</p><button className="text-button" onClick={()=>void load()}>Try again</button></div>}
      <div className="inbox-list" aria-busy={loading}>{data.items.map(item=><article className={`inbox-item ${item.read_at?'':'is-unread'}`} key={item.id}><span className="inbox-item-icon"><MessageCircle size={18}/></span><div className="inbox-item-content"><div className="inbox-item-meta"><span><strong>{item.author}</strong> {item.kind==='reply'?'replied to your comment':'commented on your post'}</span><time dateTime={new Date(item.created_at).toISOString()}>{new Date(item.created_at).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</time></div><Link className="inbox-post-link" href={`/posts/${item.post_id}#comment-${item.comment_id}`} onClick={()=>{if(!item.read_at)void markRead(item);}}>{item.title}<ArrowUpRight size={15}/></Link><p>{item.body}</p>{!item.read_at&&<button className="text-button mark-read" disabled={busy||loading} onClick={()=>void markRead(item)}><Check size={13}/>Mark read</button>}</div>{!item.read_at&&<span className="inbox-unread-dot" aria-label="Unread notification"/>}</article>)}</div>
      {loading&&<p className="inbox-status" role="status"><LoaderCircle size={18} className="spin"/>Loading your inbox…</p>}
      {!loading&&!error&&!data.items.length&&<section className="inbox-empty"><span><CheckCheck size={30}/></span><h2>{unreadOnly?'You’re all caught up.':'The conversation starts with you.'}</h2><p>{unreadOnly?'New replies will appear here.':'When someone replies to you or comments on your post, you’ll see it here.'}</p><Link href="/" className="primary-button">Explore conversations<ArrowUpRight size={15}/></Link></section>}
      {data.nextCursor&&!loading&&<button className="secondary-button inbox-more" onClick={()=>void load(data.nextCursor!)}>Load more activity</button>}
      <p className="inbox-footnote">Only you can see your inbox.</p>
    </>}
  </main>;
}
