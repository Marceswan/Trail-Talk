export const MAX_POST_IMAGES = 4;
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const IMAGE_DRAFT_LIFETIME = 14 * 86400000;
export const imageIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export type PostImage = {id:string;alt:string;width:number;height:number};
