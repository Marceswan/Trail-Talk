import {profileFields,readProfileVisibility,type ProfileField} from '@/lib/profile-visibility';
import type {Profile} from '@/lib/types';
export function ProfileFields({profile}:{profile:Profile}) {
  const visibility=readProfileVisibility(profile.profile_visibility);
  return <>
    <p className="privacy-note">Choose what to share on your public profile. Email is hidden unless you enable it below. Passwords and recovery details always stay private.</p>
    <div className="form-row"><label>Employer<input name="employer" maxLength={100} defaultValue={profile.employer||''} autoComplete="organization"/></label><label>Job title<input name="job_title" maxLength={100} defaultValue={profile.job_title||''} autoComplete="organization-title"/></label></div>
    <div className="form-row"><label>Years of experience<input name="years_experience" type="number" min={0} max={80} step={1} defaultValue={profile.years_experience??''} placeholder="Years working with Salesforce"/></label><label>Location<input name="location" maxLength={100} defaultValue={profile.location||''} placeholder="City, region, or remote"/></label></div>
    <label>Skills<input name="skills" maxLength={300} defaultValue={profile.skills||''} placeholder="Flow, Apex, LWC, solution architecture"/></label>
    <label>Certifications<input name="certifications" maxLength={300} defaultValue={profile.certifications||''} placeholder="Administrator, Platform Developer I"/></label>
    <label>Website<input name="website" type="url" maxLength={500} defaultValue={profile.website||''} placeholder="https://example.com"/></label>
    <label>Trailhead URL<input name="trailhead_url" type="url" maxLength={500} defaultValue={profile.trailhead_url||''} placeholder="https://www.salesforce.com/trailblazer/your-profile"/></label>
    <fieldset className="profile-visibility"><legend>Public profile visibility</legend><p>Your display name is always public. Uncheck any details you want to keep private.</p><div className="visibility-options">{(Object.keys(profileFields) as ProfileField[]).map(key=><label key={key}><input type="checkbox" name={`public_${key}`} defaultChecked={visibility[key]}/><span>Show {profileFields[key].toLowerCase()}</span></label>)}</div><small>Showing your email makes it visible to anyone, including visitors who are not signed in.</small></fieldset>
  </>;
}
