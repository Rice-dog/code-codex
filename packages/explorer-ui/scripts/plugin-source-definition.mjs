import {readFileSync} from 'node:fs';
const definitions=JSON.parse(readFileSync(new URL('../../../resources/plugin-definitions.json',import.meta.url),'utf8'));
export function sourcePackage(id){
 const matches=definitions.plugins?.filter(p=>p.id===id)??[];
 if(definitions.schema!==1||matches.length!==1)throw Error(`Missing or duplicate source plugin declaration: ${id}`);
 return matches[0];
}
export const sourcePackages=definitions.plugins;
