import {db} from '@/lib/db';
import {account,failure,HttpError,payload,requireAccount,transaction} from '@/lib/auth';
import {IMAGE_DRAFT_LIFETIME,imageIdPattern} from '@/lib/image-limits';

export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{id:string}>};
const missing=()=>Response.json({error:'Image not found.'},{status:404,headers:{'Cache-Control':'no-store'}});
export async function GET(_request:Request,{params}:Context) {
  try {
    const {id}=await params;if(!imageIdPattern.test(id))return missing();
    const image=await db().prepare('SELECT i.data,i.owner,i.post_id,i.created_at,p.removed FROM post_images i LEFT JOIN posts p ON p.id=i.post_id WHERE i.id=?').get(id);
    if(!image)return missing();
    if(image.post_id===null) {
      if(Number(image.created_at)<Date.now()-IMAGE_DRAFT_LIFETIME||(await account())?.id!==image.owner)return missing();
    } else if(image.removed!==0)return missing();
    const bytes=image.data as unknown;
    if(!(bytes instanceof Uint8Array))throw new Error('Invalid stored image');
    return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'image/webp','Content-Length':String(bytes.byteLength),'Content-Disposition':'inline; filename="trailtalk-image.webp"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin'}});
  } catch(error) {return failure(error);}
}

export async function DELETE(request:Request,{params}:Context) {
  try {
    // Apply the same origin/JSON checks as other mutations.
    await payload(request);
    const {id}=await params;
    return await transaction(async()=>{
      const user=await requireAccount();
      if(!imageIdPattern.test(id))return missing();
      const image=await db().prepare('SELECT owner,post_id FROM post_images WHERE id=?').get(id);
      if(!image||image.owner!==user.id)return missing();
      if(image.post_id!==null)throw new HttpError('Remove published images by editing their post.',409);
      await db().prepare('DELETE FROM post_images WHERE id=?').run(id);
      return Response.json({ok:true});
    });
  } catch(error) {return failure(error);}
}
