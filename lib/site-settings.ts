import { db } from './db';
import { defaultSiteSettings, type VersionedSiteSettings } from './site-settings-model';

export async function siteSettings(): Promise<VersionedSiteSettings> {
  const row = await db().prepare('SELECT value,revision FROM site_settings WHERE id=1').get();
  return { ...defaultSiteSettings, ...JSON.parse(String(row?.value || '{}')), revision: Number(row?.revision || 0) };
}
