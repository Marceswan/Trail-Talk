import { account, failure, HttpError } from '@/lib/auth';
import { db, publicPostColumns } from '@/lib/db';
import { searchSnippet, searchTerms } from '@/lib/search-text';
import type { Post } from '@/lib/types';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
const like=(term:string)=>`%${term.replace(/[\\%_]/g,'\\$&')}%`;
export async function GET(request:Request){
  try{
    const params=new URL(request.url).searchParams;const query=params.get('q')||'';const terms=searchTerms(query);
    if(query.length>250||terms.length>8)throw new HttpError('Use up to 8 search terms and 250 characters.');
    const page=Number(params.get('page')||1);if(!Number.isSafeInteger(page)||page<1||page>1000000)throw new HttpError('Invalid search page.');
    if(!terms.length)return Response.json({posts:[],total:0,page,hasMore:false},{headers});
    const user=(await account())?.id||'';const patterns=terms.map(like);const d=db();
    const match=(field:string)=>patterns.map(()=>`${field} LIKE ? ESCAPE '\\'`).join(' AND ');
    const titleMatch=match('p.title');
    const postMatch=match("(p.title||' '||p.body||' '||p.author||' '||community.name)");
    const commentMatch=match("(c.body||' '||c.author)");
    const conditions=['p.removed=0',`((${postMatch}) OR EXISTS(SELECT 1 FROM comments c WHERE c.post_id=p.id AND c.removed=0 AND ${commentMatch}))`];
    const values:(string|number)[]=[...patterns,...patterns];
    const view=params.get('view');const community=params.get('community');const topic=params.get('topic');const status=params.get('status');
    if(community){conditions.push('p.community=?');values.push(community);}
    if(view==='questions')conditions.push("p.tag='Question'");else if(topic&&topic!=='All posts'){conditions.push('p.tag=?');values.push(topic);}
    if(view==='mine'){conditions.push('p.owner=?');values.push(user);}
    if(view==='saved'){conditions.push('EXISTS(SELECT 1 FROM saves s WHERE s.post_id=p.id AND s.user_id=?)');values.push(user);}
    if(view==='following'){conditions.push('EXISTS(SELECT 1 FROM memberships m WHERE m.community=p.community AND m.user_id=?)');values.push(user);}
    if(view==='questions'&&['open','solved'].includes(status||''))conditions.push(`${status==='open'?'NOT ':''}EXISTS(SELECT 1 FROM comments answer WHERE answer.id=p.accepted_comment_id AND answer.post_id=p.id AND answer.removed=0)`);
    const from=`FROM posts p JOIN communities community ON community.id=p.community WHERE ${conditions.join(' AND ')}`;
    const total=Number(d.prepare(`SELECT COUNT(*) AS total ${from}`).get(...values)!.total);
    const sort=params.get('sort');
    const order=sort==='new'?'p.created_at DESC,p.id DESC':sort==='top'?'score DESC,p.created_at DESC,p.id DESC':sort==='best'?'(score+comment_count*15)*1.0/(MAX(0,?-p.created_at)/3600000.0+2) DESC,p.id DESC':'relevance DESC,p.created_at DESC,p.id DESC';
    const rows=d.prepare(`SELECT ${publicPostColumns},CASE WHEN ${titleMatch} THEN 3 WHEN ${postMatch} THEN 2 ELSE 1 END AS relevance ${from} ORDER BY ${order} LIMIT 20 OFFSET ?`).all(user,user,user,...patterns,...patterns,...values,...(sort==='best'?[Date.now()]:[]),(page-1)*20) as unknown as Post[];
    const findComment=d.prepare(`SELECT c.id,c.author,c.body FROM comments c WHERE c.post_id=? AND c.removed=0 AND ${commentMatch} ORDER BY c.created_at DESC,c.id DESC LIMIT 1`);
    const posts=rows.map(row=>{
      const comment=findComment.get(row.id,...patterns) as {id:number;author:string;body:string}|undefined;
      return {...row,match_comment:comment?{id:comment.id,author:comment.author,excerpt:searchSnippet(comment.body,terms)}:null};
    });
    return Response.json({posts,total,page,hasMore:page*20<total},{headers});
  }catch(error){if(error instanceof HttpError)return failure(error);console.error('Search failed',error instanceof Error?error.name:'Unknown error');return Response.json({error:'Search could not load. Please try again.'},{status:500,headers});}
}
