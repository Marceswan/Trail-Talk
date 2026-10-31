export type SiteSettings = {
  headline: string;
  description: string;
  notice: string;
  registrationOpen: boolean;
};
export type VersionedSiteSettings = SiteSettings & { revision: number };
export const defaultSiteSettings: SiteSettings = {
  headline: 'Your people. Your platform.',
  description: 'Big ideas, small wins, and everything Salesforce in between.',
  notice: '',
  registrationOpen: true,
};
