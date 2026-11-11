import {getLocale} from '../../i18n';
/** Presentation only: does not classify account health or decide retries. */
export function accountFailureMessage(error:unknown,scope:'quota'|'send',locale=getLocale()):string {
 const text=error instanceof Error?error.message:String(error??'');
 const zh=locale==='zh-CN';
 const say=(en:string,cn:string)=>zh?cn:en;
 if(/\b(?:ACCOUNT_AUTH_REQUIRED|AUTH_REQUIRED)\b/.test(text))return say('Sign in again to check this account.','请重新登录此账号后查询。');
 if(/\b(?:ERR_NETWORK_CHANGED|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ECONNRESET|ECONNREFUSED|ENOTFOUND)\b|networkObservation=(?:DNS|TLS[^.; ]*|PROXY[^.; ]*|CONNECTION[^.; ]*)\b|error sending request|^(?:TypeError: )?Failed to fetch$|network error|dns error/i.test(text))return scope==='quota'?say('Service connection failed. Check your network or try again shortly.','服务连接失败，请检查网络或稍后重试。'):say('The service connection was interrupted. Check your network, then try again.','服务连接中断，请检查网络后重试。');
 if(/\b(?:TIMEOUT|ACCOUNT_[A-Z_]*TIMEOUT)\b|timed out|response deadline expired/i.test(text))return say('The service did not respond in time. Try again shortly.','服务暂时未响应，请稍后重试。');
 if(scope==='quota')return /\bACCOUNT_USAGE_INCOMPLETE\b/.test(text)?say('Quota information is incomplete. Try again shortly.','额度信息暂不完整，请稍后重试。'):say('Quota could not be checked. Try again shortly.','暂时无法查询额度，请稍后重试。');
 return text;
}
