import { pluginExport } from './plugin-runtime';
import type * as Runtime from './git-history-runtime';
export const normalizeGitCommitSummary:typeof Runtime.normalizeGitCommitSummary=(...args:Parameters<typeof Runtime.normalizeGitCommitSummary>)=>pluginExport<typeof Runtime.normalizeGitCommitSummary>('git-history','normalizeGitCommitSummary')(...args);
export const normalizeGitHistory:typeof Runtime.normalizeGitHistory=(...args:Parameters<typeof Runtime.normalizeGitHistory>)=>pluginExport<typeof Runtime.normalizeGitHistory>('git-history','normalizeGitHistory')(...args);
export const normalizeGitCommit:typeof Runtime.normalizeGitCommit=(...args:Parameters<typeof Runtime.normalizeGitCommit>)=>pluginExport<typeof Runtime.normalizeGitCommit>('git-history','normalizeGitCommit')(...args);
export const normalizeGitDiff:typeof Runtime.normalizeGitDiff=(...args:Parameters<typeof Runtime.normalizeGitDiff>)=>pluginExport<typeof Runtime.normalizeGitDiff>('git-history','normalizeGitDiff')(...args);
export const formatGitDate:typeof Runtime.formatGitDate=(...args:Parameters<typeof Runtime.formatGitDate>)=>pluginExport<typeof Runtime.formatGitDate>('git-history','formatGitDate')(...args);
export const gitHistoryError:typeof Runtime.gitHistoryError=(...args:Parameters<typeof Runtime.gitHistoryError>)=>pluginExport<typeof Runtime.gitHistoryError>('git-history','gitHistoryError')(...args);
