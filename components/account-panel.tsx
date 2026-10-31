'use client';
import { useState, type FormEvent } from 'react';
export function AccountPanel({ security=false, onDone }: {security?:boolean;onDone:()=>void}) {
  const [mode,setMode]=useState(security?'security':'login');
  const [busy,setBusy]=useState(false); const [error,setError]=useState('');
  const [codes,setCodes]=useState<string[]>([]); const [message,setMessage]=useState('');
  const [saved,setSaved]=useState(false);
  async function submit(e:FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form=e.currentTarget; const fields=Object.fromEntries(new FormData(form));
    if(fields.confirm!==undefined && fields.password!==fields.confirm){setError('Passwords do not match.');return;}
    await send({...fields,action:mode==='security'?'changePassword':mode});
  }
  async function send(body:Record<string,unknown>) {
    if(busy)return;setBusy(true);setError('');
    try {
      const r=await fetch('/api/account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const result=await r.json();if(!r.ok)throw new Error(result.error);
      if(result.codes){setCodes(result.codes);setMessage(result.message);}else onDone();
    }catch(e){setError(e instanceof Error?e.message:'Unable to update your account.');}finally{setBusy(false);}
  }
  if(codes.length) return <div className="account-panel recovery-sheet"><h3>Save your recovery codes</h3><p>{message}</p><p>Keep these in a password manager or a private file. They will only be shown here once. Anyone with a code can reset your password.</p><ul>{codes.map(code=><li key={code}><code>{code}</code></li>)}</ul><button className="secondary-button" onClick={()=>{const url=URL.createObjectURL(new Blob([`TrailTalk recovery codes\nKeep private. Recovery replaces all codes.\n\n${codes.join('\n')}`],{type:'text/plain'}));const a=document.createElement('a');a.href=url;a.download='trailtalk-recovery-codes.txt';a.click();URL.revokeObjectURL(url);}}>Download codes</button><label className="check-label"><input type="checkbox" checked={saved} onChange={e=>setSaved(e.target.checked)}/>I saved my recovery codes</label><button className="primary-button" disabled={!saved} onClick={onDone}>Continue</button></div>;
  return <div className="account-panel">
    {!security&&<div className="account-tabs">{[['login','Sign in'],['register','Create account'],['recover','Recover account']].map(([id,label])=><button key={id} type="button" className={mode===id?'selected':''} aria-pressed={mode===id} onClick={()=>{setMode(id);setError('');}}>{label}</button>)}</div>}
    <form className="stack-form" onSubmit={submit}>
      {mode==='register'&&<label>Display name<input name="name" autoComplete="nickname" required minLength={2} maxLength={40}/></label>}
      {mode!=='security'&&<label>Email<input name="email" type="email" autoComplete="username" required maxLength={254}/></label>}
      {mode==='register'&&<p className="privacy-note">Your email is your sign-in name. Recovery uses saved codes; no email is sent.</p>}
      {mode==='recover'&&<><p>Use a recovery code saved when you created your account. Resetting your password signs out every device and replaces all recovery codes.</p><label>Recovery code<input name="code" autoComplete="off" required maxLength={80} spellCheck={false}/></label></>}
      {mode==='security'&&<><h3>Account security</h3><label>Current password<input name="currentPassword" type="password" autoComplete="current-password" required minLength={12} maxLength={128}/></label></>}
      <label>{['recover','security'].includes(mode)?'New password':'Password'}<input name="password" type="password" autoComplete={mode==='login'?'current-password':'new-password'} required minLength={12} maxLength={128}/></label>
      {mode!=='login'&&<><p className="privacy-note">Use 12–128 characters. A long, unique passphrase works well.</p><label>Confirm password<input name="confirm" type="password" autoComplete="new-password" required minLength={12} maxLength={128}/></label></>}
      {error&&<p className="form-error" role="alert">{error}</p>}
      <button className="primary-button" disabled={busy}>{busy?'Working…':mode==='login'?'Sign in':mode==='register'?'Create account':mode==='recover'?'Reset password':'Update password & recovery codes'}</button>
      {mode==='security'&&<><button className="secondary-button" type="button" disabled={busy} onClick={e=>{const form=e.currentTarget.closest('form')!;void send({action:'regenerateCodes',currentPassword:new FormData(form).get('currentPassword')});}}>Replace recovery codes only</button><p className="privacy-note">Enter your current password above. Either security change signs out all devices and replaces your recovery codes.</p><button className="text-button" disabled={busy} type="button" onClick={()=>void send({action:'logout'})}>Sign out</button></>}
    </form>
  </div>;
}
