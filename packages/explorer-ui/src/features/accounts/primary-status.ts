import type {PrimarySwitch} from './contracts';
import {t} from '../../i18n';

const stages:Record<string,string>={
 'idle-check':'accounts.primaryIdleCheck','route-restore':'accounts.primaryRouteRestore',
 'target-verify':'accounts.primaryTargetVerify','primary-backup':'accounts.primaryBackup',
 'backup-verify':'accounts.primaryBackupVerify','authorization-start':'accounts.primaryAuthStart',
 'authorization-open':'accounts.primaryAuthOpen','authorization-wait':'accounts.primaryWaiting',
 'identity-confirm':'accounts.primaryIdentityConfirm',
};
/** Ordinary progress is localized; failure evidence and recovery remain English. */
export function primaryStatusText(value:PrimarySwitch|null|undefined):string {
 if(!value)return '';
 const elapsed=typeof value.elapsedMs==='number'&&Number.isFinite(value.elapsedMs)?Math.max(0,Math.floor(value.elapsedMs/1000)):0;
 const detail=`stage=${value.stage||'unknown'}; elapsed=${elapsed}s${value.operationId?'; operationId='+value.operationId:''}`;
 if(value.errorCode||['failed','interrupted','mismatch'].includes(value.state)){
  const code=value.errorCode||(value.state==='mismatch'?'ACCOUNT_PRIMARY_IDENTITY_MISMATCH':'ACCOUNT_PRIMARY_INTERRUPTED');
  return `${code}: Primary-account setup ${value.state==='pending'?'requires verification':value.state}. ${detail}. ${value.formerPrimaryPreserved?'The former primary authorization was preserved. ':''}${value.recovery??'Verify the current official login before retrying. No authorization was replayed.'}`;
 }
 if(value.state==='completed')return t('accounts.primaryCompleted',{email:value.targetEmail??''});
 if(value.state==='cancelled')return value.operationId?t('accounts.primaryCancelled'):'';
 if(value.state!=='pending')return '';
 return t(stages[value.stage??'']??'accounts.primaryPreparing',{email:value.targetEmail??''})+' · '+elapsed+'s';
}
