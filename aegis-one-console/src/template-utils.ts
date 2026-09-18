export function read(context: Record<string, unknown>, path: string): any {
 if(path === 'true') return true;
 if(path === 'false') return false;
 return path.split('.').reduce((value: any, key) => value?.[key],context);
}
export function css(text: string): React.CSSProperties {
 return Object.fromEntries(text.split(';').filter(Boolean).map(part=>{
 const i=part.indexOf(':');const key=part.slice(0,i).trim().replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
 return [key,part.slice(i+1).trim()];
 }));
}
