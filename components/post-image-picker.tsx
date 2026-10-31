'use client';
import {useRef,useState} from 'react';
import {ImagePlus,LoaderCircle,X} from 'lucide-react';
import {MAX_IMAGE_BYTES,MAX_POST_IMAGES,type PostImage} from '@/lib/image-limits';

export function PostImagePicker({images,onChange,onBusyChange,disabled=false,published=false}:{images:PostImage[];onChange:(images:PostImage[])=>void;onBusyChange:(busy:boolean)=>void;disabled?:boolean;published?:boolean}) {
  const input=useRef<HTMLInputElement>(null);
  const uploading=useRef(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const [failed,setFailed]=useState<string[]>([]);
  async function upload(files:File[]) {
    if(uploading.current||disabled||!files.length)return;
    setError('');
    if(files.length+images.length>MAX_POST_IMAGES){setError('Attach up to four images per post.');return;}
    if(files.some(file=>!['image/jpeg','image/png','image/webp'].includes(file.type))){setError('Use JPEG, PNG, or WebP images.');return;}
    if(files.some(file=>file.size>MAX_IMAGE_BYTES)){setError('Each image must be smaller than 4 MB.');return;}
    uploading.current=true;setBusy(true);onBusyChange(true);
    const next=[...images];
    try {
      for(const file of files) {
        const form=new FormData();form.set('image',file);
        const response=await fetch('/api/images',{method:'POST',body:form});
        if(!response.ok){let message='The image could not be uploaded. Try again.';try{message=(await response.json()).error||message;}catch{}throw new Error(message);}
        next.push(await response.json());onChange([...next]);
      }
    } catch(cause){setError(cause instanceof Error?cause.message:'The image could not be uploaded. Try again.');}
    finally{uploading.current=false;setBusy(false);onBusyChange(false);}
  }
  function remove(image:PostImage) {
    onChange(images.filter(item=>item.id!==image.id));
    // Published images are removed atomically when the post edit is saved.
    if(!published)void fetch(`/api/images/${image.id}`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:'{}'}).catch(()=>{});
  }
  return <section className="post-image-picker" aria-label="Post images">
    <div className="image-picker-heading"><strong>Images <span>{images.length}/{MAX_POST_IMAGES}</span></strong><button className="secondary-button" type="button" disabled={disabled||busy||images.length>=MAX_POST_IMAGES} onClick={()=>input.current?.click()}>{busy?<LoaderCircle size={16} className="spin"/>:<ImagePlus size={16}/>}<span>{busy?'Uploading…':'Add images'}</span></button></div>
    <input ref={input} className="sr-only" type="file" aria-label="Upload post images" accept="image/jpeg,image/png,image/webp" multiple disabled={disabled||busy} onChange={event=>{const files=Array.from(event.target.files||[]);event.target.value='';void upload(files);}}/>
    <p className="privacy-note">JPEG, PNG, or WebP · up to 4 MB each. Unpublished uploads are private and kept for 14 days.</p>
    {!!images.length&&<div className="image-picker-grid">{images.map((image,index)=><div className="image-picker-card" key={image.id}><div className="image-picker-preview">{failed.includes(image.id)?<span>Image unavailable. Remove it and upload again.</span>:<img src={`/api/images/${image.id}`} alt={image.alt||`Attachment ${index+1}`} onError={()=>setFailed(previous=>[...previous,image.id])}/>}<button className="image-remove" type="button" aria-label={`Remove image ${index+1}`} disabled={disabled||busy} onClick={()=>remove(image)}><X size={16}/></button></div><label>Description for image {index+1}<input maxLength={200} value={image.alt} placeholder="Describe the image for screen readers" disabled={disabled||busy} onChange={event=>onChange(images.map(item=>item.id===image.id?{...item,alt:event.target.value}:item))}/></label></div>)}</div>}
    {busy&&<p role="status" className="privacy-note">Uploading and optimizing your images…</p>}
    {error&&<p className="form-error" role="alert">{error}</p>}
  </section>;
}
