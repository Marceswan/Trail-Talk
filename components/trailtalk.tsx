'use client';
import {profileFields} from '@/lib/profile-visibility';
import {ProfileFields} from './profile-fields';
import {TagField} from './tag-field';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, ArrowDown, ArrowUp, ArrowUpRight, Award, BadgeCheck, Bell, Bookmark, Check, ChevronDown, ChevronRight, Cloud, Code2, Compass, ExternalLink, Flame, Home, Image as ImageIcon, Rows3, PanelsTopLeft, LayoutGrid, Link as LinkIcon, LoaderCircle, Menu, MessageCircle, MoreHorizontal, Plus, PencilLine, Search, Send, Settings2, ShieldCheck, Sparkles, TrendingUp, Users, Workflow, X, Zap } from 'lucide-react';
import type { Comment, Community, FeedData, Post } from '@/lib/types';
import { RichText } from './rich-text';
import { MarkdownEditor } from './markdown-editor';
import { markdownExcerpt } from '@/lib/markdown';
import { SearchHighlight, useConversationSearch } from './search-results';
import { searchSnippet, searchTerms } from '@/lib/search-text';
import type { SearchPost } from '@/lib/types';
import { CommentThread } from './comment-thread';
import { feedUrl, returnFeedUrl, views, topics, type View } from '@/lib/feed-navigation';
import { AccountPanel } from './account-panel';
import { Landscape } from './landscape';
import { Dialog } from './dialog';
import { PostComposer } from './post-composer';

type Modal = 'create' | 'communities' | 'profile' | 'about' | 'account' | 'report' | 'edit' | null;
const communityIcons = { cloud: Cloud, shield: ShieldCheck, code: Code2, sparkles: Sparkles, award: Award, workflow: Workflow, message: MessageCircle };

function CloudMark({ small = false }: { small?: boolean }) {
  return <svg width={small ? 31 : 39} height={small ? 28 : 35} viewBox="0 0 48 43" fill="none" aria-hidden="true"><path d="M12 33a10 10 0 0 1-1-20 12 12 0 0 1 22-3 12 12 0 1 1 3 23H23l-9 7 1-7Z" fill="currentColor"/><circle cx="16" cy="23" r="2" fill="white"/><circle cx="24" cy="23" r="2" fill="white"/><circle cx="32" cy="23" r="2" fill="white"/></svg>;
}
function CommunityIcon({ community, small = false }: { community?: Community; small?: boolean }) {
  const Icon = communityIcons[(community?.icon || 'cloud') as keyof typeof communityIcons] || Cloud;
  return <span className={`community-icon ${small ? 'small' : ''}`} style={{ background: community?.color || '#0b96e8' }}><Icon size={small ? 14 : 19} strokeWidth={2} /></span>;
}
function ago(timestamp: number) {
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}
function shortCount(number: number) { return number >= 1000 ? `${(number / 1000).toFixed(1)}k` : String(number); }


function ComponentPreview() {
  return <div className="component-preview" aria-label="Preview of Lightning UI component collection" role="img">
    <div className="preview-copy"><span><span className="tiny-cloud"><Cloud size={16}/></span> Built for builders</span><h3>Less boilerplate.<br/>More possibility.</h3><p>A little collection of Lightning goodness.</p><span className="preview-label">Lightning Web Components <ArrowUpRight size={12}/></span></div>
    <div className="preview-widgets"><div className="widget-top"><div className="mini-logo"><Zap size={12} fill="currentColor"/></div><span>Lightning UI</span><MoreHorizontal size={14}/></div><div className="widget-content"><div className="widget-tabs"><span className="selected">Components</span><span>Overview</span></div><div className="widget-line"><span>Make it yours</span><span className="mini-toggle"/></div><div className="widget-buttons"><span>Get started <ChevronRight size={10}/></span><span>Learn more</span></div><div className="widget-stats"><div><span className="mini-icon purple"><Users size={12}/></span><small>Contacts</small><b>1,284</b></div><div><span className="mini-icon green"><TrendingUp size={12}/></span><small>Growth</small><b>+24.6<span>%</span></b></div></div><div className="widget-status"><Check size={11}/><span>Looking good. You’re ready to build.</span></div></div></div>
  </div>;
}

export default function TrailTalk({ postId = null }: { postId?: number | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const threadId = postId;
  const [data, setData] = useState<FeedData | null>(null);
  const [loadError, setLoadError] = useState('');
  const view:View = views.includes(params.get('view') as View)?params.get('view') as View:'home';
  const communityId = params.get('community');
  const label = params.get('label')||'';
  const topic = topics.includes(params.get('topic')||'')?params.get('topic')!:'All posts';
  const questionStatus=['open','solved'].includes(params.get('status')||'')?params.get('status')!:'all';
  const defaultSort = params.get('q')?.trim()?'relevance':view==='latest'||view==='questions'?'new':view==='popular'?'top':'best';
  const sort = ['best','new','top',...(params.get('q')?.trim()?['relevance']:[])].includes(params.get('sort')||'')?params.get('sort')!:defaultSort;
  const [search,setSearch] = useState(params.get('q')||'');
  const [density,setDensity] = useState<'comfortable'|'compact'>('comfortable');
  const searching=threadId===null&&Boolean(search.trim());
  const terms=useMemo(()=>searchTerms(search),[search]);
  const searchQuery=new URLSearchParams({q:search,view,sort,community:communityId||'',topic,status:questionStatus,label}).toString();
  const searchResults=useConversationSearch(searchQuery,searching&&Boolean(data),data);

  const backToFeed = threadId!==null?returnFeedUrl(params.get('from')):feedUrl(new URLSearchParams(params.toString()));
  useEffect(()=>{setSearch(params.get('q')||'');},[params,threadId]);
  useEffect(()=>{try{if(localStorage.getItem('trailtalk-density')==='compact')setDensity('compact');}catch{/* Storage may be disabled. */}},[]);
  function changeDensity(next:'comfortable'|'compact'){setDensity(next);try{localStorage.setItem('trailtalk-density',next);}catch{/* The current view still works. */}}
  function updateFilters(patch:Record<string,string|null>,replace=false) {
    const next=new URLSearchParams(window.location.search);
    for(const [key,value] of Object.entries(patch)){if(!value)next.delete(key);else next.set(key,value);}
    const url=feedUrl(next);
    if(threadId!==null)router.push(url);
    else if(url!==window.location.pathname+window.location.search)window.history[replace?'replaceState':'pushState'](null,'',url);
  }
  function changeSearch(value:string){setSearch(value);if(threadId===null)updateFilters({q:value},true);}
  function threadHref(id:number,comments=false){return `/posts/${id}${backToFeed==='/'?'':`?from=${encodeURIComponent(backToFeed)}`}${comments?'#comments':''}`;}
  const [communitySearch,setCommunitySearch]=useState('');
  const [modal, setModal] = useState<Modal>(null);
  const [reportTarget,setReportTarget]=useState<{type:'post'|'comment';id:number}|null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentError, setCommentError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [unread,setUnread]=useState(0);
  const [editingPost,setEditingPost]=useState<Post|null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);

  const load = useCallback(async () => {
    setLoadError('');
    try { const response = await fetch('/api/community'); if (!response.ok) throw new Error('Unable to load the community.'); setData(await response.json()); }
    catch { setLoadError('We couldn’t load the feed. Check your connection and try again.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(()=>{
    if(!data?.profile.registered){setUnread(0);return;}
    const controller=new AbortController();
    const refresh=async()=>{if(document.hidden)return;try{const r=await fetch('/api/notifications?summary=1',{signal:controller.signal});if(r.ok)setUnread((await r.json()).unread);else if(r.status===401)setUnread(0);}catch{/* Retry on focus or the next interval. */}};
    void refresh();const timer=setInterval(refresh,60000);window.addEventListener('focus',refresh);
    return()=>{controller.abort();clearInterval(timer);window.removeEventListener('focus',refresh);};
  },[data?.profile.registered,data?.profile.email]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 3500); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => {
    const handle = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key === 'k') { event.preventDefault(); searchRef.current?.focus(); } };
    window.addEventListener('keydown', handle); return () => window.removeEventListener('keydown', handle);
  }, []);


  const fetchComments = useCallback(async (id: number, signal?: AbortSignal) => {
    setCommentsLoading(true); setCommentError('');
    try {
      const response = await fetch(`/api/community?post=${id}`, { signal });
      if (!response.ok) throw new Error('Could not load comments.');
      const result = await response.json();
      setComments(result.comments);
    } catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) setCommentError('Comments could not be loaded. Please try again.'); }
    finally { if (!signal?.aborted) setCommentsLoading(false); }
  }, []);
  useEffect(() => {
    if (!threadId) return;
    setComments([]); setFormError('');
    const controller = new AbortController();
    void fetchComments(threadId, controller.signal);
    return () => controller.abort();
  }, [threadId, fetchComments]);

  async function mutate(payload: Record<string, unknown>) {
    if (!data?.profile.registered) { openModal('account'); return null; }
    if (busyRef.current) return null;
    busyRef.current = true; setBusy(true); setFormError('');
    try {
      const response = await fetch('/api/community', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (response.status===401) openModal('account');
      if (!response.ok) throw new Error(result.error || 'Could not save your changes.');
      if ((payload.action === 'commentVote' || payload.action === 'editComment')) setComments(result.comments);
      else setData(result as FeedData);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save your changes.';
      setFormError(message); setNotice(message); return null;
    } finally { busyRef.current = false; setBusy(false); }
  }

  function navigate(next: View, community: string | null = null) {
    setMobileMenu(false);
    updateFilters({view:next==='home'?null:next,community,topic:null,q:null,sort:null,status:null,label:null});
  }
  function openModal(next: Modal) { if(next==='communities')setCommunitySearch(''); if ((next==='create'||next==='profile'||next==='report')&&!data?.profile.registered) next='account'; setFormError(''); setModal(next); setMobileMenu(false); }
  async function share(post: Post) {
    const url = `${window.location.origin}/posts/${post.id}`;
    try { await navigator.clipboard.writeText(url); setNotice('Post link copied to clipboard.'); }
    catch { setNotice(`Post link: ${url}`); }
  }
  const community = data?.communities.find(c => c.id === communityId);
  const thread = data?.posts.find(p => p.id === threadId);
  useEffect(() => {
    if (thread && window.location.hash === '#comments') document.getElementById('comments')?.scrollIntoView();
  }, [thread?.id]);
  useEffect(()=>{
    if(!commentsLoading && /^#comment-\d+$/.test(window.location.hash)) document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
  },[commentsLoading,thread?.id,comments.length]);
  const feedPosts = useMemo(() => {
    if (!data) return [];
    return data.posts.filter(p => {
      const community = data.communities.find(c => c.id === p.community);
      return (!label||(p.tags||[]).includes(label)) && (view!=='questions'||(p.tag==='Question'&&(questionStatus==='all'||(questionStatus==='solved'?p.accepted_comment_id!==null:p.accepted_comment_id===null)))) && (!communityId || p.community === communityId) && (view !== 'mine' || p.owned) && (view !== 'saved' || p.saved) && (view !== 'following' || community?.joined) &&
        (view==='questions' || topic === 'All posts' || p.tag === topic) && (!search || `${p.title} ${p.body} ${p.author} ${community?.name}`.toLowerCase().includes(search.toLowerCase()));
    }).sort((a,b) => sort === 'new' ? b.created_at - a.created_at : sort === 'top' ? b.score - a.score : (b.score + b.comment_count * 15) / Math.pow((Date.now()-b.created_at)/3600000+2,1.5) - (a.score+a.comment_count*15) / Math.pow((Date.now()-a.created_at)/3600000+2,1.5));
  }, [data, communityId, view, topic, search, sort, questionStatus,label]);
  const filtered:Post[]=searching?searchResults.posts:feedPosts;
  const resultCount=searching?searchResults.total:filtered.length;
  const profileInitials = data?.profile.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase() || 'NT';

  function postTags(post:Post) {
    return post.tags?.length ? <div className="post-labels" aria-label="Post tags">{post.tags.map(tag=>{
      const filters=new URLSearchParams(backToFeed.split('?')[1]||'');filters.set('label',tag);
      return <Link className="post-label" key={tag} href={feedUrl(filters)}>#{tag}</Link>;
    })}</div> : null;
  }
  function report(type:'post'|'comment',id:number) {setReportTarget({type,id});openModal('report');}

  function actions(post: Post) {
    return <div className="post-actions"><div className={`vote-control ${post.vote !== 0 ? 'voted' : ''}`}><button aria-label={`Upvote ${post.title}`} aria-pressed={post.vote === 1} disabled={busy} onClick={() => void mutate({action:'vote',postId:post.id,value:post.vote===1?0:1})}><ArrowUp size={17}/></button><span>{post.score}</span><button aria-label={`Downvote ${post.title}`} aria-pressed={post.vote === -1} disabled={busy} onClick={() => void mutate({action:'vote',postId:post.id,value:post.vote===-1?0:-1})}><ArrowDown size={17}/></button></div><Link className="action-button" href={threadHref(post.id,true)}><MessageCircle size={16}/><span>{post.comment_count} <span className="comments-word">{post.comment_count === 1 ? 'comment' : 'comments'}</span></span></Link><button className="action-button share" onClick={()=>void share(post)}><ArrowUpRight size={17}/><span>Share</span></button>{Boolean(post.owned)&&!post.locked&&!data?.profile.suspended&&<button className="action-button" aria-label={`Edit ${post.title}`} onClick={()=>{setEditingPost(post);openModal('edit');}}><PencilLine size={14}/><span>Edit</span></button>}<button className="action-button report-button" onClick={()=>report('post',post.id)} aria-label={`Report ${post.title}`}><ShieldCheck size={14}/><span>Report</span></button><button className={`icon-button save-button ${post.saved?'is-saved':''}`} aria-label={`${post.saved?'Unsave':'Save'} ${post.title}`} aria-pressed={Boolean(post.saved)} disabled={busy} onClick={async()=>{const result=await mutate({action:'save',postId:post.id,value:!post.saved}); if(result)setNotice(post.saved?'Post removed from saved.':'Post saved for later.');}}><Bookmark size={17} fill={post.saved?'currentColor':'none'}/></button></div>;
  }

  const threadContent = thread && <div className="thread-page-card"><article className="thread-post"><div className="post-meta"><CommunityIcon community={data?.communities.find(c=>c.id===thread.community)} small/><strong>{data?.communities.find(c=>c.id===thread.community)?.name}</strong><span>· {ago(thread.created_at)}</span><span className="post-tag">{thread.tag}</span>{thread.accepted_comment_id!==null&&<span className="solved-badge"><BadgeCheck size={13}/>Solved</span>}</div><h1>{thread.title}</h1><div className="thread-author">Posted by {thread.author_id?<Link href={`/members/${thread.author_id}`} className="author-link">{thread.author}</Link>:thread.author}{thread.edited_at&&<span className="edited-label" title={new Date(thread.edited_at).toLocaleString()}> · edited</span>}</div><RichText className="thread-body" body={thread.body}/>{thread.visual==='components'&&<ComponentPreview/>}{postTags(thread)}{actions(thread)}</article><CommentThread question={thread.tag==='Question'?{acceptedCommentId:thread.accepted_comment_id,owned:Boolean(thread.owned),author:thread.author}:undefined} onAccept={async commentId=>{if(await mutate({action:'acceptAnswer',postId:thread.id,commentId,revision:thread.answer_revision})){setNotice(commentId===null?'Accepted answer removed. This question is open again.':'Answer accepted. Thank you for sharing what worked.');return true;}return false;}} comments={comments} count={thread.comment_count} loading={commentsLoading} error={commentError} formError={formError} busy={busy} locked={Boolean(thread.locked)} signedIn={Boolean(data?.profile.registered)} suspended={Boolean(data?.profile.suspended)} name={data?.profile.name||'Guest'} onSignIn={()=>openModal('account')} onRetry={()=>void fetchComments(thread.id)} onReport={id=>report('comment',id)} onVote={(comment,value)=>void mutate({action:'commentVote',commentId:comment.id,value})} onEdit={async(comment,body)=>{if(await mutate({action:'editComment',commentId:comment.id,revision:comment.revision,body})){setNotice('Your comment is updated.');return true;}return false;}} onSubmit={async(body,parentId)=>{if(await mutate({action:'comment',postId:thread.id,body,parentId})){await fetchComments(thread.id);setNotice(parentId?'Your reply is posted.':'Your comment is posted.');return true;}return false;}}/></div>;

  return <>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="topbar"><div className="brand-area"><button className="icon-button mobile-menu-button" aria-label="Open navigation" onClick={()=>setMobileMenu(!mobileMenu)}><Menu size={23}/></button><button className="brand" onClick={()=>navigate('home')} aria-label="TrailTalk home"><CloudMark/><span>trailtalk<span className="brand-dot">.</span></span></button><span className="beta-label">community</span></div><form className="search-box" onSubmit={e=>{e.preventDefault();if(threadId !== null)router.push(`/?q=${encodeURIComponent(search)}`);}}><Search size={18}/><input ref={searchRef} aria-label="Search TrailTalk" placeholder="Search conversations, communities, and more" value={search} onChange={e=>changeSearch(e.target.value)} maxLength={250}/>{search ? <button type="button" className="icon-button" onClick={()=>changeSearch('')} aria-label="Clear search"><X size={15}/></button>:<kbd>⌘ K</kbd>}</form><div className="header-actions"><div className="notification-wrap"><Link href="/notifications" className="icon-button notification-button" aria-label={unread?`Notifications, ${unread} unread`:"Notifications"}><Bell size={20}/>{unread>0&&<span className="unread-badge">{unread>99?'99+':unread}</span>}</Link></div><span className="header-divider"/><button aria-label="Create post" className="primary-button header-create" onClick={()=>openModal('create')}><Plus size={18}/><span>Create post</span></button><button className="profile-button" onClick={()=>openModal('profile')} aria-label={data?.profile.registered?"Edit your profile":"Sign in"}><span className="avatar profile-avatar">{data?.profile.registered?profileInitials:'↗'}</span>{!data?.profile.registered&&<span>Sign in</span>}<ChevronDown size={14}/></button></div></header>

    {mobileMenu&&<button className="sidebar-scrim" aria-label="Close navigation" onClick={()=>setMobileMenu(false)}/>}
    <aside className={`sidebar ${mobileMenu?'mobile-open':''}`}><nav aria-label="Main navigation"><div className="nav-group">{([{id:'home',icon:Home,label:'Home'},{id:'popular',icon:Flame,label:'Popular'},{id:'latest',icon:Compass,label:'Explore'},{id:'questions',icon:MessageCircle,label:'Questions'},{id:'saved',icon:Bookmark,label:'Saved posts'},{id:'mine',icon:PencilLine,label:'My posts'}] as const).map(item=><button key={item.id} className={`nav-item ${view===item.id&&!communityId?'selected':''}`} onClick={()=>navigate(item.id)}><item.icon size={20}/><span>{item.label}</span>{item.id==='home'&&view==='home'&&!communityId&&<span className="nav-indicator"/>}</button>)}<Link href="/notifications" className="nav-item"><Bell size={20}/><span>Inbox</span>{unread>0&&<span className="unread-badge">{unread>99?'99+':unread}</span>}</Link></div><div className="sidebar-section"><div className="section-label"><span>Your communities</span><button className="icon-button" aria-label="Find communities" onClick={()=>openModal('communities')}><Plus size={16}/></button></div>{data?.communities.map(c=><button key={c.id} className={`nav-item community-nav ${communityId===c.id?'selected':''}`} onClick={()=>navigate('home',c.id)}><CommunityIcon community={c} small/><span>{c.name}</span>{Boolean(c.joined)&&<span className="joined-dot"/>}</button>)}<button className="browse-link" onClick={()=>openModal('communities')}><LayoutGrid size={16}/>Browse all communities<ChevronRight size={14}/></button></div><div className="sidebar-section resource-nav">{Boolean(data?.profile.registered)&&data&&['moderator','admin'].includes(data.profile.role)&&<Link href="/moderation" className="nav-item"><ShieldCheck size={19}/><span>Moderation</span></Link>}<div className="section-label">Resources</div><a className="nav-item" href="https://trailhead.salesforce.com/" target="_blank" rel="noreferrer"><Award size={19}/><span>Trailhead</span><ArrowUpRight size={14}/></a><a className="nav-item" href="https://developer.salesforce.com/docs" target="_blank" rel="noreferrer"><Code2 size={19}/><span>Developer docs</span><ArrowUpRight size={14}/></a><button className="nav-item" onClick={()=>openModal('about')}><Cloud size={19}/><span>About TrailTalk</span></button></div></nav><div className="sidebar-bottom"><div className="ohana-note"><span className="ohana-icon"><CloudMark small/></span><strong>A little more connected.</strong><p>A lot more possible.</p><span>That’s the power of Ohana.</span></div><div className="sidebar-footer"><span>Made for the community <span className="heart">♥</span></span><small>© {new Date().getFullYear()} TrailTalk</small></div></div></aside>

    <main id="main-content" tabIndex={-1} className={`main-shell ${threadId !== null ? 'thread-page' : ''}`}><div className="content-container">{Boolean(data?.profile.suspended)&&<p className="account-banner">Your account is suspended. You can browse, but cannot post, vote, or report.</p>}{threadId !== null ? <nav className="thread-navigation" aria-label="Conversation navigation"><Link href={backToFeed} className="back-to-feed"><ArrowLeft size={17}/>Back to feed</Link><span>Community conversation</span></nav> : view==='home'&&!search&&topic==='All posts'?<section className={`hero ${community?'community-hero':''}`}><div className="hero-content"><div className="hero-eyebrow">{community?<><CommunityIcon community={community} small/>{shortCount(community.members)} community members</>:<><span className="live-dot"/>The unofficial Salesforce hangout</>}</div><h1>{community?community.name:<>Your people. Your platform.</>}</h1><p>{community?community.description:'Big ideas, small wins, and everything Salesforce in between.'}</p><button className="hero-button" onClick={()=>community?void mutate({action:'join',community:community.id,value:!community.joined}):openModal('communities')}>{community?(community.joined?<><Check size={15}/>Joined community</>:<>Join the community <Plus size={15}/></>):<>Find your community <ArrowUpRight size={16}/></>}</button></div><Landscape/><span className="hero-note"><Cloud size={14}/> A community built on sharing.</span></section>:<section className="feed-intro"><span className="feed-intro-icon">{search?<Search size={24}/>:view==='questions'?<MessageCircle size={24}/>:view==='saved'?<Bookmark size={24}/>:view==='following'?<Users size={24}/>:view==='popular'?<Flame size={24}/>:<Compass size={24}/>}</span><div><h1>{search?'Search conversations':community?community.name:view==='questions'?'Questions & answers':view==='mine'?'My posts':view==='saved'?'Your reading list':view==='following'?'Your communities':view==='popular'?'Popular conversations':view==='latest'?'Fresh from the community':topic}</h1><p>{search?`Find ideas, answers, and people across TrailTalk.`:view==='questions'?'Share what worked. Help someone take their next step.':view==='mine'?'Conversations you’ve started.':view==='saved'?'The conversations you want to come back to.':view==='following'?'The latest from the communities you’ve joined.':view==='popular'?'What the Salesforce community is talking about.':'Ask a question. Share a discovery. Keep learning.'}</p></div></section>}

    <div className="feed-layout"><div className="feed-column">{threadId !== null ? (threadContent || <div className="empty-state" role="status">{loadError ? <><p>{loadError}</p><button className="primary-button" onClick={()=>void load()}>Try again</button></> : data ? <><h1>Conversation not found</h1><Link className="primary-button" href="/">Back to feed</Link></> : <><LoaderCircle className="spin" size={24}/><p>Loading the conversation…</p></>}</div>) : <><section className="composer"><button className="avatar profile-avatar" aria-label="Edit profile" onClick={()=>openModal('profile')}>{profileInitials}</button><button className="compose-prompt" onClick={()=>openModal('create')}>{view==='questions'?'What would you like help with?':'What’s on your mind, Trailblazer?'}</button><span className="composer-divider"/><button className="icon-button" onClick={()=>openModal('create')} aria-label="Create a show and tell post"><ImageIcon size={21}/></button><button className="icon-button" onClick={()=>openModal('create')} aria-label="Share a resource"><LinkIcon size={20}/></button></section>

    <div className="feed-toolbar"><div className="feed-tabs">{view==='questions'?<h2>Questions <span className="count-pill">{resultCount}</span></h2>:community?<h2>{community.name}</h2>:view==='mine'?<h2>My posts <span className="count-pill">{resultCount}</span></h2>:view==='saved'?<h2>Saved posts <span className="count-pill">{resultCount}</span></h2>:view==='popular'?<h2><Flame size={19}/>Popular conversations</h2>:view==='latest'?<h2><Compass size={19}/>Explore conversations</h2>:<><button className={view==='home'?'active':''} onClick={()=>navigate('home')}>For you</button><button className={view==='following'?'active':''} onClick={()=>navigate('following')}>Following</button></>}</div><div className="feed-tools"><div className="sort-control"><Settings2 size={15}/><select aria-label="Sort posts" value={sort} onChange={e=>updateFilters({sort:e.target.value})}>{searching&&<option value="relevance">Relevant</option>}<option value="best">Best</option><option value="new">Newest</option><option value="top">Top voted</option></select></div><div className="density-toggle" role="group" aria-label="Feed layout"><button aria-label="Comfortable view" title="Comfortable view" aria-pressed={density==='comfortable'} onClick={()=>changeDensity('comfortable')}><PanelsTopLeft size={16}/></button><button aria-label="Compact view" title="Compact view" aria-pressed={density==='compact'} onClick={()=>changeDensity('compact')}><Rows3 size={16}/></button></div></div></div>
    {view==='questions'?<div className="question-filters"><div className="topic-filters" role="group" aria-label="Question status">{[['all','All questions'],['open','Open'],['solved','Solved']].map(([status,label])=><button key={status} aria-pressed={questionStatus===status} className={questionStatus===status?'active':''} onClick={()=>updateFilters({status:status==='all'?null:status})}>{status==='solved'&&<BadgeCheck size={14}/>} {label}</button>)}</div><label className="question-community-filter">Community<select aria-label="Filter question community" value={communityId||''} onChange={e=>updateFilters({community:e.target.value||null})}><option value="">All communities</option>{data?.communities.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label></div>:<div className="topic-filters" aria-label="Filter by topic">{topics.map(t=><button key={t} className={topic===t?'active':''} aria-pressed={topic===t} onClick={()=>updateFilters({topic:t==='All posts'?null:t})}>{t==='All posts'&&<LayoutGrid size={13}/>} {t}</button>)}</div>}
    {searching&&<section className="search-feedback" aria-label="Search results status"><div className="search-summary" role="status">{searchResults.loading&&!filtered.length?'Searching conversations…':!searchResults.error?<>{searchResults.total} result{searchResults.total!==1?'s':''} for <strong>“{search}”</strong></>:null}</div><p className="search-hint">Searches posts, tags, and replies. Use quotes for an exact phrase.</p>{searchResults.error&&<div className="search-error" role="alert"><span>{searchResults.error}</span><button className="text-button" onClick={searchResults.retry}>Retry search</button></div>}</section>}
    {!data&&!loadError&&<div className="loading-state"><LoaderCircle className="spin" size={24}/><p>Finding your people…</p></div>}
    {loadError&&<div className="empty-state"><Cloud size={32}/><h3>The feed couldn’t load</h3><p>{loadError}</p><button className="primary-button" onClick={()=>void load()}>Try again</button></div>}
    {data&&filtered.length===0&&(!searching||(!searchResults.loading&&!searchResults.error))&&<div className="empty-state"><span className="empty-icon">{view==='saved'?<Bookmark size={30}/>:view==='following'?<Users size={30}/>:<Search size={30}/>}</span><h3>{searching?'No matching conversations.':view==='questions'?(questionStatus==='solved'?'No solved questions here yet.':questionStatus==='open'?'No open questions here.':'No questions here yet.'):view==='mine'?'Your first post starts here.':view==='saved'?'Good conversations are worth keeping.':view==='following'?'Make this feed your own.':'No conversations here yet.'}</h3><p>{searching?'Try fewer words, check your spelling, or change the topic or community filter.':view==='questions'?'Try another community or status, or ask a question of your own.':view==='mine'?'Share a question, a discovery, or a small win with the community.':view==='saved'?'Tap the bookmark on any post to come back to it here.':view==='following'?'Join a community to see its conversations in your feed.':'Try another topic or be the first to start a conversation.'}</p><button className="primary-button" onClick={()=>view==='following'?openModal('communities'):view==='saved'?navigate('home'):search?changeSearch(''):openModal('create')}>{view==='following'?'Find your community':view==='saved'?'Explore the feed':search?'Clear search':view==='questions'?'Ask a question':'Start a conversation'}</button></div>}
    {label&&<div className="tag-filter"><span>Tagged <strong>#{label}</strong></span><button className="text-button" onClick={()=>updateFilters({label:null})}>Clear tag filter <X size={14}/></button></div>}
    <div className={`post-list ${density==='compact'?'compact-feed':''}`} data-density={density}>{filtered.map((post,index)=>{const c=data?.communities.find(c=>c.id===post.community);return <article className="post-card" key={post.id}><div className="post-meta"><button className="post-community" onClick={()=>navigate('home',post.community)}><CommunityIcon community={c} small/><strong>{c?.name}</strong></button><span className="meta-dot">·</span><span>{ago(post.created_at)}</span><span className={`post-tag tag-${post.tag.toLowerCase().replaceAll(' ','-').replace('&','and')}`}>{post.tag}</span>{post.accepted_comment_id!==null&&<span className="solved-badge"><BadgeCheck size={13}/>Solved</span>}</div><div className="post-author"><span className={`avatar author-avatar avatar-${index%4}`}>{post.initials}</span><span>{post.author_id?<Link href={`/members/${post.author_id}`} className="author-link">{post.author}</Link>:post.author}</span>{post.edited_at&&<span className="edited-label" title={new Date(post.edited_at).toLocaleString()}>edited</span>}{post.author==='Sarah Chen'&&<span className="author-badge" title="Community contributor"><ShieldCheck size={12}/></span>}</div><Link className="post-title-button" href={threadHref(post.id)}><h2>{searching?<SearchHighlight text={post.title} terms={terms}/>:post.title}{Boolean(post.locked)&&<span className="locked-label"><ShieldCheck size={12}/>Locked</span>}</h2></Link><p className="post-excerpt">{searching?<SearchHighlight text={searchSnippet(post.body,terms)} terms={terms}/>:markdownExcerpt(post.body)}</p>{searching&&(post as SearchPost).match_comment&&<Link className="search-comment-match" href={`${threadHref(post.id)}#comment-${(post as SearchPost).match_comment!.id}`}><span><MessageCircle size={13}/>Matching reply by {(post as SearchPost).match_comment!.author}<ArrowUpRight size={13}/></span><p><SearchHighlight text={(post as SearchPost).match_comment!.excerpt} terms={terms}/></p></Link>}{!searching&&post.visual==='components'&&<Link className="post-visual-button" href={threadHref(post.id)} aria-label="View component library discussion"><ComponentPreview/></Link>}{!searching&&post.visual==='certification'&&<div className="certification-preview"><span><Award size={36}/></span><div><small>A new milestone unlocked</small><strong>Salesforce Certified<br/>Platform Developer I</strong></div><Sparkles size={29}/></div>}{postTags(post)}{actions(post)}</article>})}</div>
    {searching&&filtered.length>0&&<div className="search-pagination"><span>Showing {filtered.length} of {searchResults.total} conversations</span>{searchResults.hasMore&&<button className="secondary-button" disabled={searchResults.loading} onClick={()=>void searchResults.loadMore()}>{searchResults.loading?'Loading…':'Load more results'}</button>}</div>}
    {data&&filtered.length>0&&!searching&&<div className="feed-end"><CloudMark small/><span>You’re in good company.</span><button onClick={()=>openModal('create')}>Add your voice to the conversation</button></div>}
    </>} </div>

    <aside className="right-rail"><section className="rail-card welcome-card"><div className="rail-title"><span className="hello">✌️</span><h2>A little more Ohana.</h2></div><p>A space for the people behind the platform. Learn something. Share something. Find your people.</p><div className="community-proof"><div className="avatar-stack"><span className="avatar">SC</span><span className="avatar">MJ</span><span className="avatar">EP</span><span className="avatar">DK</span></div><span><strong>Built by Trailblazers.</strong><small>Better with you.</small></span></div><div className="welcome-footer"><span className="live-dot"/>Everyone’s welcome here</div></section>

    <section className="rail-card communities-card"><div className="rail-title"><h2>Find your community</h2><Users size={17}/></div><div className="community-list">{data?.communities.filter(c=>c.id!=='flow').slice(0,5).map(c=><div className="community-row" key={c.id}><button className="community-row-info" onClick={()=>navigate('home',c.id)}><CommunityIcon community={c}/><span><strong>{c.name}</strong><small>{shortCount(c.members)} members</small></span></button><button className={`join-button ${c.joined?'joined':''}`} aria-label={`${c.joined?'Leave':'Join'} ${c.name}`} disabled={busy} onClick={async()=>{const result=await mutate({action:'join',community:c.id,value:!c.joined});if(result)setNotice(c.joined?`You left ${c.name}.`:`You joined ${c.name}.`);}}>{c.joined?<Check size={14}/>:'Join'}</button></div>)}</div><button className="rail-link" onClick={()=>openModal('communities')}>Explore all communities <ChevronRight size={15}/></button></section>

    <section className="spotlight-card"><div className="spotlight-label"><Sparkles size={15}/>The Trailblazer spirit</div><h2>We all start<br/>somewhere.</h2><p>Your first flow. Your next certification.<br/>There’s a trail for that.</p><a href="https://trailhead.salesforce.com/" target="_blank" rel="noreferrer">Find your next adventure <ArrowUpRight size={15}/></a><div className="trail-badge"><div><Award size={30}/><span>KEEP<br/>EXPLORING</span></div></div><div className="spotlight-hill"/></section>

    <section className="community-guidelines"><h3>Good people. Good conversations.</h3><p>Be kind. Stay curious. Share what you know.<br/>We’re all here to grow together.</p><button onClick={()=>openModal('about')}>Our community guidelines <ArrowUpRight size={13}/></button></section><div className="rail-footer"><button onClick={()=>openModal('about')}>About</button><span>·</span><a href="https://www.salesforce.com/" target="_blank" rel="noreferrer">Salesforce</a><span>·</span><button onClick={()=>openModal('about')}>Community guidelines</button><p>Independent community. Not affiliated with Salesforce.</p></div></aside>
    </div></div></main>

    {modal==='create'&&data?.profile.email&&<PostComposer key={data.profile.email} profile={data.profile} communities={data.communities} initialCommunity={communityId||'salesforce'} initialTopic={view==='questions'?'Question':communityId==='flow-n-tell'?'Show & tell':'Discussion'} onClose={()=>setModal(null)} onSignIn={()=>openModal('account')} onPublished={(result,tag,warning)=>{setData(result);setModal(null);navigate(view==='questions'&&tag==='Question'?'questions':'latest');setNotice(warning||'Your post is live. Let the conversation begin!');}}/>}

    {modal==='edit'&&editingPost&&<Dialog title="Edit post" subtitle="Keep the context that people have already replied to." onClose={()=>setModal(null)}><form className="post-form" onSubmit={async e=>{e.preventDefault();const fields=new FormData(e.currentTarget);if(await mutate({action:'editPost',postId:editingPost.id,revision:editingPost.revision,title:fields.get('title'),body:fields.get('body'),tags:String(fields.get('tags')||'').split(',')})){setModal(null);setNotice('Your post is updated.');}}}><label>Title<input name="title" required minLength={5} maxLength={180} defaultValue={editingPost.title}/></label><MarkdownEditor label="Your post" name="body" required minLength={10} maxLength={10000} rows={7} defaultValue={editingPost.body}/><TagField defaultValue={(editingPost.tags||[]).join(', ')}/>{formError&&<p className="form-error" role="alert">{formError}</p>}<div className="dialog-footer"><button type="button" className="text-button" onClick={()=>setModal(null)}>Cancel</button><button className="primary-button" disabled={busy}>Save changes</button></div></form></Dialog>}

    {modal==='communities'&&<Dialog title="Find your people" subtitle="A shared platform. A world of different interests." onClose={()=>setModal(null)} wide><div className="directory-content"><label className="directory-search">Find a community<input type="search" aria-label="Find a community" value={communitySearch} onChange={e=>setCommunitySearch(e.target.value)} placeholder="Search clouds, interests, and tools"/></label><div className="community-directory">{data?.communities.filter(c=>`${c.name} ${c.description}`.toLowerCase().includes(communitySearch.trim().toLowerCase())).map(c=><div className="directory-card" key={c.id}><div className="directory-heading"><CommunityIcon community={c}/><button disabled={busy} className={`join-button ${c.joined?'joined':''}`} onClick={()=>void mutate({action:'join',community:c.id,value:!c.joined})}>{c.joined?<><Check size={13}/> Joined</>:<><Plus size={13}/> Join</>}</button></div><h3><button onClick={()=>{navigate('home',c.id);setModal(null);}}>{c.name}<ArrowUpRight size={14}/></button></h3><p>{c.description}</p><small>{shortCount(c.members)} members</small></div>)}</div>{data&&!data.communities.some(c=>`${c.name} ${c.description}`.toLowerCase().includes(communitySearch.trim().toLowerCase()))&&<p className="directory-empty" role="status">No communities match that search.</p>}</div></Dialog>}

    {modal==='profile'&&<Dialog title="Make yourself at home" subtitle="A little introduction goes a long way." onClose={()=>setModal(null)}><form className="post-form" onSubmit={async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const fields=new FormData(e.currentTarget);if(await mutate({action:'profile',name:fields.get('name'),bio:fields.get('bio'),visibility:Object.fromEntries(Object.keys(profileFields).map(key=>[key,fields.has(`public_${key}`)])),...Object.fromEntries(['employer','job_title','years_experience','location','skills','certifications','website','trailhead_url'].map(key=>[key,fields.get(key)]))})){setModal(null);setNotice('Your profile has been updated.');}}}><div className="profile-intro"><span className="avatar profile-avatar">{data?.profile.registered?profileInitials:'↗'}</span>{!data?.profile.registered&&<span>Sign in</span>}<p>Your TrailTalk profile</p></div><label>Display name<input name="name" required minLength={2} maxLength={40} defaultValue={data?.profile.name}/></label><label>About you<textarea name="bio" rows={5} maxLength={1000} defaultValue={data?.profile.bio} placeholder="Tell the community about your background, interests, and what you like to build."/></label>{data&&<ProfileFields profile={data.profile}/>} {data?.profile.id&&<Link className="text-button" href={`/members/${data.profile.id}`}>View public profile <ArrowUpRight size={14}/></Link>}<p className="privacy-note">Your profile and activity follow your account across devices.</p>{formError&&<p className="form-error" role="alert">{formError}</p>}<div className="dialog-footer"><span/><button className="primary-button" disabled={busy||!data}><Check size={16}/>Save profile</button></div></form><AccountPanel security onDone={async()=>{await load();setModal(null);if(threadId)void fetchComments(threadId);}}/></Dialog>}

    {modal==='account'&&<Dialog title="Your TrailTalk account" onClose={()=>{setModal(null);void load();}}><AccountPanel onDone={async()=>{await load();setModal(null);if(threadId)void fetchComments(threadId);}}/></Dialog>}
    {modal==='report'&&reportTarget&&<Dialog title="Report to moderators" subtitle="Reports are private to the moderation team." onClose={()=>setModal(null)}><form className="stack-form" onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);setFormError('');const fields=Object.fromEntries(new FormData(e.currentTarget));try{const r=await fetch('/api/moderation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'report',targetType:reportTarget.type,targetId:reportTarget.id,...fields})});const result=await r.json();if(!r.ok)throw new Error(result.error);setModal(null);setNotice('Report sent to moderators. Thank you.');}catch(e){setFormError(e instanceof Error?e.message:'Could not send report.');}finally{setBusy(false);}}}><label>Reason<select name="reason">{['Spam','Harassment','Private information','Off topic','Other'].map(r=><option key={r}>{r}</option>)}</select></label><label>Details (optional)<textarea name="details" rows={4} maxLength={1000} placeholder="Help moderators understand what happened."/></label>{formError&&<p className="form-error" role="alert">{formError}</p>}<button className="primary-button" disabled={busy}>Send report</button></form></Dialog>}

    {modal==='about'&&<Dialog title="Good people. Good conversations." subtitle="Welcome to TrailTalk, an independent Salesforce community." onClose={()=>setModal(null)}><div className="about-content"><p>TrailTalk is a place for the people behind the platform — admins, developers, architects, and everyone finding their way. The starting conversations are sample content to get things going. Your new posts, votes, comments, and saves are real and persist.</p><div><strong>Be kind.</strong><p>Welcome beginners, assume good intentions, and critique ideas with respect.</p></div><div><strong>Share what you know.</strong><p>Add context, credit your sources, and help someone take their next step.</p></div><div><strong>Keep it safe and relevant.</strong><p>Never share customer data, credentials, or private org details. Keep conversations connected to the Salesforce ecosystem.</p></div><p className="privacy-note">TrailTalk is not affiliated with or endorsed by Salesforce. Accounts and content are stored in this app’s database. Report posts or comments for moderator review. Save your recovery codes to restore access if you forget your password.</p></div></Dialog>}


    {notice&&<div className="toast" role="status"><Check size={17}/><span>{notice}</span><button className="icon-button" onClick={()=>setNotice('')} aria-label="Dismiss notification"><X size={15}/></button></div>}
  </>;
}
