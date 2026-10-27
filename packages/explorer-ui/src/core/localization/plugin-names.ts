import names from '../../../../../resources/plugin-display-names.json';
import { t } from '../../i18n';

const byName = new Map(Object.entries(names).map(([id, name]) => [name, id]));
export function pluginDisplayName(idOrEnglish: string): string {
  const id = Object.hasOwn(names, idOrEnglish) ? idOrEnglish : byName.get(idOrEnglish);
  return id ? t(`plugin.name.${id}`) : idOrEnglish;
}
export function isPluginName(value: string): boolean { return byName.has(value); }
