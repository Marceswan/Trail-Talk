import {profileFields,readProfileVisibility,type ProfileField} from '@/lib/profile-visibility';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {ArrowLeft,ArrowUpRight,BriefcaseBusiness,MapPin,Award} from 'lucide-react';
import {db} from '@/lib/db';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export default async function MemberPage({params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  if(id.length>100)notFound();
  // Read visibility server-side and remove hidden fields before rendering any HTML or RSC content.
  // Password hashes, roles and recovery data are never selected.
  const member=await db().prepare('SELECT id,name,bio,email,profile_visibility,employer,job_title,years_experience,location,skills,certifications,website,trailhead_url FROM profiles WHERE id=? AND password_hash IS NOT NULL').get(id);
  if(!member)notFound();
  const visibility=readProfileVisibility(member.profile_visibility);
  for(const key of Object.keys(profileFields) as ProfileField[])if(!visibility[key])member[key]=null;
  delete member.profile_visibility;
  const posts=await db().prepare('SELECT id,title,tag FROM posts WHERE owner=? AND removed=0 ORDER BY created_at DESC,id DESC LIMIT 20').all(id);
  const counts=await db().prepare('SELECT (SELECT COUNT(*) FROM posts WHERE owner=? AND removed=0) AS posts,(SELECT COUNT(*) FROM comments c JOIN posts p ON p.id=c.post_id WHERE c.owner=? AND c.removed=0 AND p.removed=0) AS comments').get(id,id);
  const name=String(member.name);const initials=name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
  const chips=(value:unknown)=>String(value||'').split(',').map(t=>t.trim()).filter(Boolean);
  const safeLink=(value:unknown)=>{try{const url=new URL(String(value));return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{return null;}};
  return <main className="member-page"><Link className="member-back" href="/"><ArrowLeft size={17}/>Back to TrailTalk</Link><section className="member-card"><header className="member-heading"><span className="avatar profile-avatar member-avatar" aria-hidden="true">{initials}</span><div><h1>{name}</h1>{member.job_title&&<p className="member-title">{String(member.job_title)}</p>}</div></header><div className="member-facts">{member.employer&&<span><BriefcaseBusiness size={16}/>{String(member.employer)}</span>}{member.location&&<span><MapPin size={16}/>{String(member.location)}</span>}{member.years_experience!==null&&<span><Award size={16}/>{String(member.years_experience)} {member.years_experience===1?'year':'years'} of Salesforce experience</span>}</div>{member.bio&&<section className="member-section"><h2>About</h2><p className="member-bio">{String(member.bio)}</p></section>}{(['skills','certifications'] as const).map(key=>chips(member[key]).length>0&&<section className="member-section" key={key}><h2>{key==='skills'?'Skills':'Certifications'}</h2><ul className="member-chips">{chips(member[key]).map((item,i)=><li key={`${item}-${i}`}>{item}</li>)}</ul></section>)}<div className="member-links">{member.email&&<a className="secondary-button" href={`mailto:${member.email}`}>{String(member.email)}<ArrowUpRight size={15}/></a>}{(['website','trailhead_url'] as const).map(key=>{const href=safeLink(member[key]);return href&&<a className="secondary-button" key={key} href={href} target="_blank" rel="noopener noreferrer nofollow ugc">{key==='website'?'Website':'Trailhead'}<ArrowUpRight size={15}/></a>;})}</div><p className="member-counts">{String(counts?.posts||0)} posts · {String(counts?.comments||0)} comments</p></section><section className="member-card"><h2>Recent posts</h2>{posts.length?<ul className="member-posts">{posts.map(post=><li key={Number(post.id)}><Link href={`/posts/${post.id}`}><span>{String(post.title)}</span><ArrowUpRight size={16}/></Link><small>{String(post.tag)}</small></li>)}</ul>:<p className="member-empty">No public posts yet.</p>}</section></main>;
}
