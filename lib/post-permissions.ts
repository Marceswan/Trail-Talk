export const ANNOUNCEMENTS = 'announcements';
export const ANNOUNCEMENT_TOPIC = 'Announcements';

export function canPublishPost(role: string | undefined, community: string, topic: string) {
  return (community !== ANNOUNCEMENTS && topic !== ANNOUNCEMENT_TOPIC)
    || role === 'admin' || role === 'moderator';
}
