import { account, failure, HttpError } from '@/lib/auth';
import { isPostgres } from '@/lib/database';
import { db, publicPostColumns, withPostTags } from '@/lib/db';
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
    const match=(field:string)=>patterns.map(()=>`${field} ${isPostgres()?'ILIKE':'LIKE'} ? ESCAPE '\\'`).join(' AND ');
    const titleMatch=match('p.title');
    const postMatch=match("(p.title||' '||p.body||' '||p.author||' '||community.name)");
    const commentMatch=match("(c.body||' '||c.author)");
    const tagMatch=match('t.label');
    const conditions=['p.removed=0',`((${postMatch}) OR EXISTS(SELECT 1 FROM comments c WHERE c.post_id=p.id AND c.removed=0 AND ${commentMatch}) OR EXISTS(SELECT 1 FROM post_tags t WHERE t.post_id=p.id AND ${tagMatch}))`];
    const values:(string|number)[]=[...patterns,...patterns,...patterns];
    const label=params.get('label');if(label){conditions.push('EXISTS(SELECT 1 FROM post_tags t WHERE t.post_id=p.id AND t.label=?)');values.push(label);}
    const view=params.get('view');const community=params.get('community');const topic=params.get('topic');const status=params.get('status');
    if(community){conditions.push('p.community=?');values.push(community);}
    if(view==='questions')conditions.push("p.tag='Question'");else if(topic&&topic!=='All posts'){conditions.push('p.tag=?');values.push(topic);}
    if(view==='mine'){conditions.push('p.owner=?');values.push(user);}
    if(view==='saved'){conditions.push('EXISTS(SELECT 1 FROM saves s WHERE s.post_id=p.id AND s.user_id=?)');values.push(user);}
    if(view==='following'){conditions.push('EXISTS(SELECT 1 FROM memberships m WHERE m.community=p.community AND m.user_id=?)');values.push(user);}
    if(view==='questions'&&['open','solved'].includes(status||''))conditions.push(`${status==='open'?'NOT ':''}EXISTS(SELECT 1 FROM comments answer WHERE answer.id=p.accepted_comment_id AND answer.post_id=p.id AND answer.removed=0)`);
    const from=`FROM posts p JOIN communities community ON community.id=p.community WHERE ${conditions.join(' AND ')}`;
    const total=Number((await d.prepare(`SELECT COUNT(*) AS total ${from}`).get(...values))!.total);
    const sort=params.get('sort');
    const order=sort==='new'?'created_at DESC,id DESC':sort==='top'?'score DESC,created_at DESC,id DESC':sort==='best'?`(score+comment_count*15)*1.0/(${isPostgres()?'GREATEST':'MAX'}(0,?-created_at)/3600000.0+2) DESC,id DESC`:'relevance DESC,created_at DESC,id DESC';
    const rows=(await d.prepare(`SELECT * FROM (SELECT ${publicPostColumns},CASE WHEN ${titleMatch} THEN 3 WHEN ${postMatch} THEN 2 ELSE 1 END AS relevance ${from}) ranked ORDER BY ${order} LIMIT 20 OFFSET ?`).all(user,user,user,...patterns,...patterns,...values,...(sort==='best'?[Date.now()]:[]),(page-1)*20)) as unknown as Post[];
    const findComment=d.prepare(`SELECT c.id,c.author,c.body FROM comments c WHERE c.post_id=? AND c.removed=0 AND ${commentMatch} ORDER BY c.created_at DESC,c.id DESC LIMIT 1`);
    const posts=await Promise.all(rows.map(async row=>{
      const comment=(await findComment.get(row.id,...patterns)) as {id:number;author:string;body:string}|undefined;
      return {...row,match_comment:comment?{id:comment.id,author:comment.author,excerpt:searchSnippet(comment.body,terms)}:null};
    }));
    return Response.json({posts:await withPostTags(posts),total,page,hasMore:page*20<total},{headers});
  }catch(error){if(error instanceof HttpError)return failure(error);console.error('Search failed',error instanceof Error?error.name:'Unknown error');return Response.json({error:'Search could not load. Please try again.'},{status:500,headers});}
}
