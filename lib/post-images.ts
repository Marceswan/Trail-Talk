import {db} from './db';
import {HttpError} from './auth';
import {IMAGE_DRAFT_LIFETIME,imageIdPattern,MAX_POST_IMAGES} from './image-limits';

export function validateImages(value:unknown): {id:string;alt:string}[] {
  if(value===undefined)return [];
  if(!Array.isArray(value)||value.length>MAX_POST_IMAGES)throw new HttpError('Attach up to four images.');
  const images=value.map(image=>{
    if(!image||typeof image.id!=='string'||!imageIdPattern.test(image.id)||typeof image.alt!=='string'||image.alt.length>200)throw new HttpError('Choose valid images with descriptions up to 200 characters.');
    return {id:image.id,alt:image.alt.trim()};
  });
  if(new Set(images.map(image=>image.id)).size!==images.length)throw new HttpError('Each image can only be attached once.');
  return images;
}

// Called inside the post's transaction, after authorization and revision checks.
export async function savePostImages(postId:number,owner:string,value:unknown) {
  const images=validateImages(value),d=db();
  for(const image of images) {
    const row=await d.prepare('SELECT owner,post_id,created_at FROM post_images WHERE id=?').get(image.id);
    if(!row||row.owner!==owner||(row.post_id!==null&&Number(row.post_id)!==postId)||(row.post_id===null&&Number(row.created_at)<Date.now()-IMAGE_DRAFT_LIFETIME))throw new HttpError('An image is unavailable or belongs to another post. Remove it and upload it again.',400);
  }
  if(images.length)await d.prepare(`DELETE FROM post_images WHERE post_id=? AND id NOT IN (${images.map(()=>'?').join(',')})`).run(postId,...images.map(image=>image.id));
  else await d.prepare('DELETE FROM post_images WHERE post_id=?').run(postId);
  for(const [position,image] of images.entries())await d.prepare('UPDATE post_images SET post_id=?,alt=?,position=? WHERE id=?').run(postId,image.alt,position,image.id);
}
