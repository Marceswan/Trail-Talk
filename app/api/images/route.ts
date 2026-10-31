import {randomUUID} from 'node:crypto';
import sharp, {type OutputInfo} from 'sharp';
import {db} from '@/lib/db';
import {failure,HttpError,rateLimit,requireAccount,transaction} from '@/lib/auth';
import {IMAGE_DRAFT_LIFETIME,MAX_IMAGE_BYTES} from '@/lib/image-limits';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const maxRequestBytes=MAX_IMAGE_BYTES+65536;

export async function POST(request:Request) {
  try {
    const origin=request.headers.get('origin');
    if(request.headers.get('sec-fetch-site')==='cross-site'||(origin&&new URL(origin).host!==request.headers.get('host')))throw new HttpError('Request origin is not allowed.',403);
    const user=await requireAccount();
    await rateLimit(`images:${user.id}`,20,3600000);
    if(Number(request.headers.get('content-length'))>maxRequestBytes)throw new HttpError('Choose an image smaller than 4 MB.',413);
    const contentType=request.headers.get('content-type')||'';
    if(!contentType.startsWith('multipart/form-data;'))throw new HttpError('Choose an image to upload.');
    const reader=request.body?.getReader();
    if(!reader)throw new HttpError('Choose an image to upload.');
    const chunks:Uint8Array[]=[];let length=0;
    try {
      while(true){const next=await reader.read();if(next.done)break;length+=next.value.length;if(length>maxRequestBytes){await reader.cancel();throw new HttpError('Choose an image smaller than 4 MB.',413);}chunks.push(next.value);}
    } finally {reader.releaseLock();}
    let form:FormData;
    try {form=await new Response(Buffer.concat(chunks),{headers:{'Content-Type':contentType}}).formData();}
    catch {throw new HttpError('The upload could not be read. Choose the image again.');}
    const file=form.get('image');
    if(!(file instanceof File)||!file.size)throw new HttpError('Choose an image to upload.');
    if(file.size>MAX_IMAGE_BYTES)throw new HttpError('Choose an image smaller than 4 MB.',413);
    if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new HttpError('Use a JPEG, PNG, or WebP image.');
    let result: {data:Buffer;info:OutputInfo};
    try {
      const bytes=Buffer.from(await file.arrayBuffer());
      const jpeg=bytes.subarray(0,3).equals(Buffer.from([0xff,0xd8,0xff]));
      const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
      const webp=bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
      if(!jpeg&&!png&&!webp)throw new Error('Unsupported image signature');
      const input=sharp(bytes,{limitInputPixels:40000000,failOn:'warning'});
      const metadata=await input.metadata();
      if(!['jpeg','png','webp'].includes(metadata.format||'')||(metadata.pages||1)>1)throw new Error('Unsupported image');
      result=await input.rotate().resize(2560,2560,{fit:'inside',withoutEnlargement:true}).webp({quality:85,effort:4}).toBuffer({resolveWithObject:true});
    } catch {throw new HttpError('This file is not a supported still image. Use a JPEG, PNG, or WebP image under 40 megapixels.');}
    if(result.data.length>2*1024*1024)throw new HttpError('This image is too detailed to store. Resize it and try again.',413);
    const id=randomUUID();
    await transaction(async()=>{
      const current=await requireAccount();
      if(current.id!==user.id)throw new HttpError('Your account changed. Sign in again.',401);
      const d=db();
      await d.prepare('DELETE FROM post_images WHERE post_id IS NULL AND created_at<?').run(Date.now()-IMAGE_DRAFT_LIFETIME);
      const pending=Number((await d.prepare('SELECT COUNT(*) AS count FROM post_images WHERE owner=? AND post_id IS NULL').get(user.id))?.count||0);
      if(pending>=20)throw new HttpError('You have too many unpublished images. Remove unused draft images before uploading more.',429);
      await d.prepare('INSERT INTO post_images (id,owner,data,width,height,created_at) VALUES (?,?,?,?,?,?)').run(id,user.id,result.data,result.info.width,result.info.height,Date.now());
    });
    return Response.json({id,alt:'',width:result.info.width,height:result.info.height},{status:201,headers:{'Cache-Control':'no-store'}});
  } catch(error) {return failure(error);}
}
