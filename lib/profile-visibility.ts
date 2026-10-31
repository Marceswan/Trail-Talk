export const profileFields = {
  bio: 'Bio', employer: 'Employer', job_title: 'Job title', years_experience: 'Years of experience',
  location: 'Location', skills: 'Skills', certifications: 'Certifications', website: 'Website', trailhead_url: 'Trailhead URL', email: 'Email address',
} as const;
export type ProfileField = keyof typeof profileFields;
export type ProfileVisibility = Record<ProfileField,boolean>;
export const defaultProfileVisibility = Object.fromEntries(Object.keys(profileFields).map(key=>[key,key!=='email'])) as ProfileVisibility;
export function readProfileVisibility(raw:unknown):ProfileVisibility {
  let value:unknown;try{value=typeof raw==='string'?JSON.parse(raw):raw;}catch{return {...defaultProfileVisibility};}
  const result={...defaultProfileVisibility};
  if(value&&typeof value==='object'&&!Array.isArray(value))for(const key of Object.keys(profileFields) as ProfileField[]){if(typeof (value as Record<string,unknown>)[key]==='boolean')result[key]=(value as ProfileVisibility)[key];}
  return result;
}
export function validateProfileVisibility(value:unknown, previous?:unknown):ProfileVisibility {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.entries(value).some(([key,visible])=>!Object.hasOwn(profileFields,key)||typeof visible!=='boolean'))throw new Error('Choose valid profile visibility settings.');
  return {...readProfileVisibility(previous),...value} as ProfileVisibility;
}
