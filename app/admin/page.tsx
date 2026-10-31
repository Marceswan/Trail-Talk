import Link from 'next/link';
import { account } from '@/lib/auth';
import { AdminWorkspace } from '@/components/admin-workspace';
export const dynamic='force-dynamic';
export const metadata={title:'Admin panel · TrailTalk',robots:{index:false,follow:false}};

export default async function AdminPage() {
  const user=await account();
  if (!user || user.role!=='admin' || user.suspended) return <main className="moderation-shell"><h1>Admin access required</h1><p>Sign in with an active administrator account to manage TrailTalk.</p><Link className="back-to-feed" href="/">Back to TrailTalk</Link></main>;
  return <AdminWorkspace/>;
}
