/** Native settings contain both a resolved sandbox and the selected profile.
 * RPC requires one selector. Preserve the profile (including ':' built-ins).
 */
export function permissionSettings(current:Record<string,any>):Record<string,unknown>{
 const settings=Object.fromEntries(['approvalPolicy','approvalsReviewer'].filter(k=>current[k]!==undefined).map(k=>[k,current[k]]));
 const profile=current.permissions??current.activePermissionProfile?.id;
 if(profile!==undefined&&profile!==null)settings.permissions=profile;
 else if(current.sandboxPolicy!==undefined){settings.permissions=null;settings.sandboxPolicy=current.sandboxPolicy;}
 return settings;
}
