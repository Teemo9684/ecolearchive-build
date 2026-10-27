import { repo } from "../db/idb";
import { sha256 } from "../files";
import type { Correspondence, DocumentFile, DocumentRecord } from "../db/types";
export type IntegrityReport={documents:number;missingFiles:string[];hashMismatches:string[];unlinkedCorrespondences:string[];duplicateReferences:string[]};
export async function scanArchiveIntegrity():Promise<IntegrityReport>{
 const docs=await repo<DocumentRecord>("documents").list();
 const corr=await repo<Correspondence>("correspondences").list();
 const files=new Map((await repo<DocumentFile>("documentFiles").list()).map(f=>[f.id,f]));
 const missingFiles:string[]=[],hashMismatches:string[]=[],unlinkedCorrespondences:string[]=[],duplicateReferences:string[]=[];
 const refs=new Map<string,string>();
 for(const d of docs.filter(x=>!x.deletedAt)){
  if(d.fileId){
   const file=files.get(d.fileId);
   if(!file)missingFiles.push(d.reference+" — "+d.title);
   else if(d.hash && await sha256(file.blob)!==d.hash)hashMismatches.push(d.reference+" — "+d.title);
  }
  if(d.reference.startsWith("أرش/")){
   const prior=refs.get(d.reference);
   if(prior && prior!==d.id)duplicateReferences.push(d.reference);
   else refs.set(d.reference,d.id);
  }
 }
 for(const c of corr.filter(x=>!x.deletedAt)){
  if(!docs.some(d=>d.relatedType==="correspondence"&&d.relatedId===c.id&&!d.deletedAt))
   unlinkedCorrespondences.push(c.reference);
 }
 return {documents:docs.filter(x=>!x.deletedAt).length,missingFiles,hashMismatches,unlinkedCorrespondences,duplicateReferences};
}
