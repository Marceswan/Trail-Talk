import type { VersionedSiteSettings } from './site-settings-model';
export type AdminUser = { id:string; name:string; email:string; role:'user'|'moderator'|'admin'; suspended:number };
export type AdminData = {
  viewerId:string;
  users:AdminUser[];
  total:number;
  page:number;
  pageSize:number;
  counts:{users:number;staff:number;suspended:number;openReports:number};
  settings:VersionedSiteSettings;
  log:{id:number;actor_name:string;action:string;target_type:string;target_id:string;reason:string;created_at:number}[];
};
