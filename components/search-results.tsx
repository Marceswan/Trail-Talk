'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { SearchData } from '@/lib/types';
const empty:SearchData={posts:[],total:0,page:0,hasMore:false};
export function useConversationSearch(query:string,enabled:boolean,refreshKey:unknown){
  const [state,setState]=useState<{key:string;data:SearchData;error:string;loading:boolean}>({key:'',data:empty,error:'',loading:false});
  const [retry,setRetry]=useState(0);const controller=useRef<AbortController|null>(null);const generation=useRef(0);
  useEffect(()=>{
    const id=++generation.current;controller.current?.abort();
    if(!enabled)return;
    setState({key:query,data:empty,error:'',loading:true});
    const abort=new AbortController();controller.current=abort;
    const timer=setTimeout(async()=>{
      try{const r=await fetch(`/api/search?${query}`,{signal:abort.signal});const result=await r.json();if(!r.ok)throw new Error(result.error||'Search could not load.');if(id===generation.current)setState({key:query,data:result,error:'',loading:false});}
      catch(error){if(!abort.signal.aborted&&id===generation.current)setState({key:query,data:empty,error:error instanceof Error?error.message:'Search could not load.',loading:false});}
    },180);
    return()=>{clearTimeout(timer);abort.abort();controller.current?.abort();generation.current++;};
  },[query,enabled,refreshKey,retry]);
  async function loadMore(){
    if(state.loading||!state.data.hasMore||state.key!==query)return;
    const id=generation.current;const abort=new AbortController();controller.current=abort;
    setState(previous=>({...previous,error:'',loading:true}));
    try{const r=await fetch(`/api/search?${query}&page=${state.data.page+1}`,{signal:abort.signal});const result:SearchData & {error?:string}=await r.json();if(!r.ok)throw new Error(result.error||'More results could not load.');
      if(id===generation.current)setState(previous=>({key:query,data:{...result,posts:[...previous.data.posts,...result.posts.filter(post=>!previous.data.posts.some(old=>old.id===post.id))]},error:'',loading:false}));
    }catch(error){if(!abort.signal.aborted&&id===generation.current)setState(previous=>({...previous,error:error instanceof Error?error.message:'More results could not load.',loading:false}));}
  }
  const current=state.key===query?state:{key:query,data:empty,error:'',loading:enabled};
  return {...current.data,error:current.error,loading:current.loading,loadMore,retry:()=>current.data.page?void loadMore():setRetry(value=>value+1)};
}
export function SearchHighlight({text,terms}:{text:string;terms:string[]}){
  if(!terms.length)return text;
  const pattern=new RegExp(`(${[...terms].sort((a,b)=>b.length-a.length).map(term=>term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')})`,'gi');
  const parts:ReactNode[]=text.split(pattern).map((part,index)=>index%2?<mark key={index}>{part}</mark>:part);
  return <>{parts}</>;
}
