import {DEFAULT_OPTIONS,normalize,KEY} from './options';
import {recordCaughtRuntimeError} from '../../runtime-operations';
export * from './options';
export function readSettings(){try{return normalize(JSON.parse(localStorage.getItem(KEY)??'{}'))}catch(error){recordCaughtRuntimeError('Shallow Ocean settings read',error);return {...DEFAULT_OPTIONS}}}
