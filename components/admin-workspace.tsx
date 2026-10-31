'use client';
import Link from 'next/link';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {ArrowLeft,Settings2,ShieldCheck,Users,History,LoaderCircle} from 'lucide-react';
import type {AdminData} from '@/lib/admin-types';
import type {VersionedSiteSettings} from '@/lib/site-settings-model';
import {Dialog} from './dialog';

type Section='users'|'settings'|'history';
type Pending={label:string;detail:string;payload:Record<string,unknown>};
export function AdminWorkspace() {
  const [section,setSection]=useState<Section>('users');
  const [data,setData]=useState<AdminData|null>(null);
  const [settings,setSettings]=useState<VersionedSiteSettings|null>(null);
  const [filters,setFilters]=useState({q:'',role:'',status:'',page:1});
  const [search,setSearch]=useState('');
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
  const [error,setError]=useState(''),[notice,setNotice]=useState('');
  const [pending,setPending]=useState<Pending|null>(null);
  const [actionError,setActionError]=useState('');
  const requestId=useRef(0);
  const saving=useRef(false);

  const load=useCallback(async(replaceSettings=false)=>{
    const id=++requestId.current;
    setLoading(true);setError('');
    try {
      const query=new URLSearchParams({...filters,page:String(filters.page)});
      const response=await fetch(`/api/admin?${query}`,{cache:'no-store'});
      const result=await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not load the admin panel.');
      if (id!==requestId.current) return;
      setData(result);
      setSettings(previous=>replaceSettings||!previous?result.settings:previous);
    } catch(cause) {
      if(id===requestId.current){setData(null);setError(cause instanceof Error?cause.message:'Could not load the admin panel.');}
    } finally { if(id===requestId.current)setLoading(false); }
  },[filters]);
  useEffect(()=>{void load();return()=>{requestId.current++;};},[load]);
  function choose(next:Pending){setPending(next);setActionError('');setNotice('');}
  async function confirm(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(!pending||saving.current)return;
    saving.current=true;setBusy(true);setActionError('');
    const reason=new FormData(event.currentTarget).get('reason');
    try {
      const response=await fetch('/api/admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...pending.payload,reason})});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error || 'The change could not be saved.');
      const isSettings=pending.payload.action==='settings';
      setPending(null);setNotice(isSettings?'Site settings saved.':'User access updated.');
      await load(isSettings);
    } catch(cause) {setActionError(cause instanceof Error?cause.message:'The change could not be saved.');}
    finally {saving.current=false;setBusy(false);}
  }
  return <main className="moderation-shell admin-shell">
    <div className="admin-toplinks"><Link className="back-to-feed" href="/"><ArrowLeft size={17}/>Back to TrailTalk</Link><Link className="back-to-feed" href="/moderation"><ShieldCheck size={17}/>Content moderation</Link></div>
    <header className="moderation-heading"><span className="moderation-mark"><Settings2 size={28}/></span><div><h1>Admin panel</h1><p>Manage the people and settings behind TrailTalk.</p></div></header>
    {error&&<div className="form-error account-banner" role="alert"><p>{error}</p><button className="text-button" onClick={()=>void load()}>Retry</button></div>}
    {notice&&<p className="account-banner" role="status">{notice}</p>}
    {!data&&loading&&<p role="status"><LoaderCircle className="spin" size={18}/> Loading admin panel…</p>}
    {data&&<>
      <dl className="admin-overview"><div><dt>Registered users</dt><dd>{data.counts.users}</dd></div><div><dt>Active staff</dt><dd>{data.counts.staff}</dd></div><div><dt>Suspended</dt><dd>{data.counts.suspended}</dd></div><div><dt>Open reports</dt><dd><Link href="/moderation">{data.counts.openReports}</Link></dd></div></dl>
      <nav className="moderation-tabs" aria-label="Admin sections">{([{id:'users',label:'Users',icon:Users},{id:'settings',label:'Site settings',icon:Settings2},{id:'history',label:'History',icon:History}] as const).map(item=><button key={item.id} className={section===item.id?'selected':''} aria-pressed={section===item.id} onClick={()=>setSection(item.id)}><item.icon size={16}/>{item.label}</button>)}</nav>
      {section==='users'&&<section aria-label="User management">
        <form className="admin-filters stack-form" onSubmit={event=>{event.preventDefault();setFilters({...filters,q:search,page:1});}}>
          <label>Search users<input type="search" value={search} maxLength={100} placeholder="Name or email" onChange={event=>setSearch(event.target.value)}/></label>
          <label>Role<select value={filters.role} onChange={event=>setFilters({...filters,role:event.target.value,page:1})}><option value="">All roles</option><option value="user">Members</option><option value="moderator">Moderators</option><option value="admin">Admins</option></select></label>
          <label>Status<select value={filters.status} onChange={event=>setFilters({...filters,status:event.target.value,page:1})}><option value="">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option></select></label>
          <button className="secondary-button" disabled={loading}>Search</button>
        </form>
        <p className="moderation-caption">{data.total} matching user{data.total===1?'':'s'}. Emails are visible here for administration; public profile privacy settings still apply.</p>
        <div className="moderation-list" aria-busy={loading}>{data.users.map(user=><article className="moderation-card admin-user" key={user.id} aria-label={`Manage ${user.name}`}>
          <div className="admin-user-identity"><Link href={`/members/${user.id}`}><strong>{user.name}</strong></Link><span>{user.email}</span><div className="moderation-meta"><span className="status-badge">{user.role==='user'?'Member':user.role==='admin'?'Admin':'Moderator'}</span><span>{user.suspended?'Suspended':'Active'}</span>{user.id===data.viewerId&&<span>You</span>}</div></div>
          {user.id===data.viewerId?<p className="admin-self-note">Your own access is protected.</p>:<div className="admin-user-controls stack-form">
            <label>Role<select aria-label={`Role for ${user.name}`} value={user.role} disabled={busy||loading} onChange={event=>choose({label:`Change role for ${user.name}`,detail:`Set this account’s role to ${event.target.value}. Admins can manage all users and site settings; moderators can manage content and publish announcements.`,payload:{action:'role',userId:user.id,role:event.target.value}})}><option value="user">Member</option><option value="moderator">Moderator</option><option value="admin">Admin</option></select></label>
            <div className="moderation-actions"><button className="secondary-button" disabled={busy||loading} onClick={()=>choose({label:`${user.suspended?'Restore access for':'Suspend'} ${user.name}`,detail:user.suspended?'This member will be able to sign in and participate again.':'This signs out every device and blocks participation. Public browsing remains available.',payload:{action:user.suspended?'unsuspend':'suspend',userId:user.id}})}>{user.suspended?'Restore access':'Suspend'}</button><button className="text-button" disabled={busy||loading} onClick={()=>choose({label:`Sign out ${user.name}`,detail:'End all active sessions for this account. The member can sign in again with their existing credentials.',payload:{action:'signOut',userId:user.id}})}>Sign out all devices</button></div>
          </div>}
        </article>)}</div>
        {!data.users.length&&<div className="moderation-empty"><Users/><h2>No matching users</h2><p>Try another name, email, role, or status.</p></div>}
        <div className="admin-pagination"><button className="secondary-button" disabled={loading||filters.page<=1} onClick={()=>setFilters({...filters,page:filters.page-1})}>Previous</button><span>Page {data.page} of {Math.max(1,Math.ceil(data.total/data.pageSize))}</span><button className="secondary-button" disabled={loading||data.page*data.pageSize>=data.total} onClick={()=>setFilters({...filters,page:filters.page+1})}>Next</button></div>
      </section>}
      {section==='settings'&&settings&&<section className="moderation-card admin-settings"><h2>Site settings</h2><p>Update the homepage and new account registration. Existing members can always sign in and recover their accounts.</p>
        <form className="stack-form" onSubmit={event=>{event.preventDefault();choose({label:'Save site settings',detail:'These changes apply across TrailTalk. Your reason will be recorded in the audit history.',payload:{action:'settings',...settings}});}}>
          <label>Homepage headline<input required minLength={3} maxLength={100} value={settings.headline} onChange={event=>setSettings({...settings,headline:event.target.value})}/></label>
          <label>Homepage description<textarea required minLength={3} maxLength={300} rows={3} value={settings.description} onChange={event=>setSettings({...settings,description:event.target.value})}/></label>
          <label>Site notice<textarea maxLength={500} rows={3} value={settings.notice} onChange={event=>setSettings({...settings,notice:event.target.value})}/><span className="privacy-note">Shown above the feed and conversations. Leave blank to hide it. Plain text only.</span></label>
          <label className="check-label"><input type="checkbox" checked={settings.registrationOpen} onChange={event=>setSettings({...settings,registrationOpen:event.target.checked})}/>Allow new account registration</label>
          <div className="moderation-actions"><button className="primary-button" disabled={busy||loading}>Save settings</button><button type="button" className="text-button" disabled={busy||loading} onClick={()=>{setSettings(data.settings);void load(true);}}>Reload saved settings</button></div>
        </form>
      </section>}
      {section==='history'&&<section aria-label="Admin history"><p className="moderation-caption">The 50 most recent admin and moderation actions.</p><div className="moderation-list">{data.log.map(entry=><article className="moderation-card" key={entry.id}><div className="moderation-meta"><strong>{entry.actor_name}</strong><span className="status-badge">{entry.action}</span><time dateTime={new Date(entry.created_at).toISOString()}>{new Date(entry.created_at).toLocaleString()}</time></div><p>{entry.reason}</p><small>{entry.target_type} · {entry.target_id}</small></article>)}</div>{!data.log.length&&<p>No actions recorded yet.</p>}</section>}
    </>}
    {pending&&<Dialog title={pending.label} onClose={()=>{if(!saving.current)setPending(null);}}><form className="post-form" onSubmit={confirm}><p>{pending.detail}</p><label>Reason for change<textarea name="reason" required minLength={3} maxLength={500} rows={3} autoFocus placeholder="Explain why this change is needed."/></label>{actionError&&<p role="alert" className="form-error">{actionError}</p>}<div className="dialog-footer"><button type="button" className="text-button" disabled={busy} onClick={()=>setPending(null)}>Cancel</button><button className="primary-button" disabled={busy}>{busy?'Saving…':'Confirm change'}</button></div></form></Dialog>}
  </main>;
}
