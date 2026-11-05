import { createContext, useContext } from 'react';
import type { Entity, EntityKind, MeResponse, SnapshotResponse } from '../../shared/v2';
export class RequestError extends Error { constructor(message:string,public status:number){super(message);} }
export async function request<T>(path:string,method='GET',body?:unknown):Promise<T>{
  const response=await fetch(`/api/v2${path}`,{method,credentials:'same-origin',headers:{'Content-Type':'application/json','X-Diabeatit-Client':'web'},body:body===undefined?undefined:JSON.stringify(body)});
  let data;try{data=await response.json();}catch{throw new RequestError('The server is unavailable. Your change was not saved.',response.status);}
  if(!response.ok)throw new RequestError(data.error||'The request failed.',response.status);
  return data as T;
}
export interface ProductContext {me:MeResponse;snapshot:SnapshotResponse;spaceId:string;busy:boolean;request:typeof request;create:(kind:EntityKind,data:unknown)=>Promise<boolean>;update:(entity:Entity,data:unknown)=>Promise<boolean>;remove:(entity:Entity)=>Promise<boolean>;refresh:()=>Promise<void>;notify:(message:string)=>void;}
export const Context=createContext<ProductContext|null>(null);
export function useProduct(){const c=useContext(Context);if(!c)throw new Error('Workspace not loaded');return c;}