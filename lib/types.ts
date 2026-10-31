export type Community = {
  id: string; name: string; description: string; color: string; icon: string;
  members: number; joined: boolean;
};
export type Post = {
  id: number; community: string; author: string; initials: string;
  author_id?: string | null; title: string; body: string; tag: string; tags?: string[]; visual: string | null;
  created_at: number; score: number; vote: number; saved: boolean; comment_count: number; locked: number; owned: number; edited_at: number | null; revision: number; accepted_comment_id: number | null; answer_revision: number;
};
export type Comment = { id: number; author_id?:string|null; author: string; body: string; created_at: number; score: number; vote: -1 | 0 | 1; removed: number; parent_id: number | null; owned: number; edited_at: number | null; revision: number };
export type Profile = { profile_visibility?:string; id?:string; employer?:string; job_title?:string; years_experience?:number|null; location?:string; skills?:string; certifications?:string; website?:string; trailhead_url?:string; name: string; bio: string; email: string | null; role: 'user' | 'moderator' | 'admin'; suspended: number; registered: number };
export type FeedData = { communities: Community[]; posts: Post[]; profile: Profile };

export type InboxItem = { id:number; comment_id:number; post_id:number; kind:'reply'|'comment'; author:string; title:string; body:string; created_at:number; read_at:number|null };
export type InboxData = {items:InboxItem[]; unread:number; nextCursor:number|null};

export type SearchPost = Post & {match_comment: {id:number;author:string;excerpt:string}|null};
export type SearchData = {posts:SearchPost[]; total:number; page:number; hasMore:boolean};
