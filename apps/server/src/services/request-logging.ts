/** Query parameter names are decoded before redaction, including percent-encoded keys. */
export function redactRequestUrl(raw:string):string {
 try{const url=new URL(raw,'http://localhost');for(const key of new Set(url.searchParams.keys()))if(key.toLowerCase()==='token')url.searchParams.set(key,'[REDACTED]');return url.pathname+url.search;}
 catch{return '[invalid request URL]';}
}
