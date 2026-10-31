import { redirect } from 'next/navigation';
import TrailTalk from '@/components/trailtalk';

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  // Keep previously shared conversation URLs working.
  if (typeof query.post === 'string' && /^[1-9]\d*$/.test(query.post)) redirect(`/posts/${query.post}`);
  return <TrailTalk />;
}
