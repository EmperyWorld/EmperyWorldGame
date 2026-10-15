export function cliArgs(values=process.argv.slice(2)):Map<string,string>{
 return new Map(values.filter(value=>value!=='--').map(value=>{
  const raw=value.replace(/^--/,''),separator=raw.indexOf('=');
  return separator<0?[raw,'1'] as const:[raw.slice(0,separator),raw.slice(separator+1)] as const;
 }));
}
