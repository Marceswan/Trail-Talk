import { notFound } from 'next/navigation';
import TrailTalk from '@/components/trailtalk';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const postId = Number(id);
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(postId) || !(await db().prepare('SELECT id FROM posts WHERE id=? AND removed=0').get(postId))) notFound();
  return <TrailTalk postId={postId} />;
}
