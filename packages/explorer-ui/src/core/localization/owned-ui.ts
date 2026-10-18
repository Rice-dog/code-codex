import { translate,t,getLocale,parameterLanguage,subscribeLanguage } from '../../i18n';
// Only product-owned, explicitly supplied UI roots are adapted. User content is
// excluded by data-i18n-skip; never observe the official document or translate code.
const skip='.git-history-commit-copy strong,.git-history-commit-meta,.git-history-detail > h4,.git-history-detail-meta,.git-history-file-path,.preview-extension h4,#cle-startupTransition-background option,[data-i18n-skip],pre,code,textarea,input,[contenteditable="true"],script,style,.node-name:not([data-i18n-owned]),.project-name,.particle-library-name,.particle-image-transform-name,.tree-label,.tree-name,.file-name,.startup-video-card-name,.particle-image-name,.pixel-sculpt-image-name,.tab-label,.file-content,.markdown-body,.git-diff-reader,.notebook-cell,.notebook-output,.office-document,.office-word-document,.office-slide-viewport,.office-sheet-tabs,.csv-title,.diagram-title,.notebook-title,.diagram-canvas,.gallery-name,.detail,table';
const contentLabels='.markdown-body[aria-label],.git-diff-reader[aria-label],.notebook-cell[aria-label],.csv-table[aria-label],.diagram-canvas[aria-label]';
export function localizeOwnedUi(root: HTMLElement|ShadowRoot): () => void {
  const originals=new WeakMap<Node,{ source: string; rendered: string }>();
  const attributes=new WeakMap<Element,Map<string,{ source: string; rendered: string }>>();
  const queue=new Set<Node>(); let scheduled=false,disposed=false;
  const node=(n: Node) => {
    if(n.nodeType===Node.TEXT_NODE) {
      if(n.parentElement?.closest(skip)||n.parentElement?.closest('[data-plugin-name],[data-i18n-key]')) return;
      const current=n.textContent??'',previous=originals.get(n);
      const source=previous?.rendered===current? previous.source:current;
      const text=source.trim();
      const value=source.replace(text,translate(text));
      originals.set(n,{ source,rendered: value }); if(current!==value) n.textContent=value;
    } else if(n instanceof Element) {
      if(!n.matches(contentLabels)&&((n.matches(skip)&&!n.matches('input,textarea'))||n.parentElement?.closest(skip))) return;
      const key=n.getAttribute('data-i18n-key');
      if(key&&n.childElementCount===0&&!n.matches('[data-plugin-name]')) {
        const value=t(key);
        if(n.textContent!==value)n.textContent=value;
      }
      const values=attributes.get(n)??new Map<string,{ source: string; rendered: string }>(); attributes.set(n,values);
      for(const attr of ['title','aria-label','placeholder','aria-valuetext']) {
        if(attr==='title'&&n.matches('[data-path],.particle-library-select,.gallery-preview')) continue;
        const current=n.getAttribute(attr); if(current===null) continue;
        const prior=values.get(attr); const source=prior?.rendered===current? prior.source:current;

        const value=translate(source); values.set(attr,{ source,rendered: value }); if(value!==current) n.setAttribute(attr,value);
      }
      if(n.matches('[data-language]')) { (n as HTMLElement).dataset.language=parameterLanguage(); (n as HTMLElement).lang=getLocale(); }
    }
  };
  const visit=(n: Node) => {
    if(n instanceof Element&&n.matches(skip)&&!n.matches('input,textarea')) { if(n.matches(contentLabels)) node(n); return; }
    node(n);
    // Prune entire source/document subtrees, rather than walking every syntax
    // token on editor input. Input values remain untouched; only their labels adapt.
    const walker=document.createTreeWalker(n,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT,{ acceptNode: item => { if(item instanceof Element&&item.matches(skip)&&!item.matches('input,textarea')) { if(item.matches(contentLabels)) node(item); return NodeFilter.FILTER_REJECT; } return NodeFilter.FILTER_ACCEPT; } });
    while(walker.nextNode()) node(walker.currentNode);
  };
  const flush=() => { scheduled=false; if(disposed) return; const nodes=[...queue]; queue.clear(); for(const n of nodes) if(n===root||n.isConnected) visit(n); };
  const observer=new MutationObserver(records => { for(const r of records) { if(r.type==='childList') for(const n of r.addedNodes) queue.add(n); else queue.add(r.target); } if(queue.size&&!scheduled) { scheduled=true; queueMicrotask(flush); } });
  visit(root); observer.observe(root,{ subtree: true,childList: true,characterData: true,attributes: true,attributeFilter: ['title','aria-label','placeholder','aria-valuetext'] });
  const unsubscribe=subscribeLanguage(() => visit(root));
  return () => { disposed=true; observer.disconnect(); unsubscribe(); queue.clear(); };
}
