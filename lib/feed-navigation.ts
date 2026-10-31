export type View='home'|'popular'|'latest'|'saved'|'following'|'mine'|'questions';
export const views:View[]=['home','popular','latest','saved','following','mine','questions'];
export const topics=['All posts','Discussion','Question','Show & tell','Tips & tricks','Career wins'];
export function feedUrl(params:URLSearchParams) {
  const safe=new URLSearchParams();
  for(const key of ['view','community','q','topic','sort','status','label']) {
    const value=params.get(key);
    if(value) safe.set(key,value.slice(0,250));
  }
  const query=safe.toString();return query?`/?${query}`:'/';
}
export function returnFeedUrl(value:string|null) {
  return value?.startsWith('/?')?feedUrl(new URLSearchParams(value.slice(2))):'/';
}
