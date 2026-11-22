import type {PrimarySwitch} from './contracts';
import {t} from '../../i18n';

/** This status is displayed in settings. Technical details belong in the runtime log. */
export function primaryStatusText(value:PrimarySwitch|null|undefined):string {
 if(!value)return '';
 if(value.state==='completed')return t('accounts.primaryCompleted',{email:value.targetEmail??''});
 if(value.state==='cancelled')return value.operationId?t('accounts.primaryCancelled'):'';
 if(value.state==='interrupted'||value.state==='mismatch'||value.errorCode&&value.state==='pending')return 'Check which account is signed in before retrying.';
 if(value.state==='failed')return 'Could not switch the primary account. Try again.';
 if(value.state!=='pending')return '';
 if(value.stage==='authorization-wait')return t('accounts.primaryWaiting',{email:value.targetEmail??''});
 return t(value.stage==='internal-switch'?'accounts.primaryInternalSwitch':'accounts.primaryPreparing');
}
