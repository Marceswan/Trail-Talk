import type {PostImage} from '@/lib/image-limits';

export function PostImages({images=[],compact=false,title}:{images?:PostImage[];compact?:boolean;title:string}) {
  if(!images.length)return null;
  return <div className={`post-images ${compact?'post-images-feed':'post-images-thread'}`} aria-label="Attached images">{images.map((image,index)=><a key={image.id} href={`/api/images/${image.id}`} target="_blank" rel="noopener noreferrer" aria-label={`Open image ${index+1} in full size`}><img loading="lazy" decoding="async" src={`/api/images/${image.id}`} width={image.width} height={image.height} alt={image.alt||`Image ${index+1} attached to ${title}`}/></a>)}</div>;
}
