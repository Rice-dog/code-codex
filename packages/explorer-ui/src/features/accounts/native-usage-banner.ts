import {icons} from '../../icons';
import {getLocale} from '../../i18n';
import {runtimeEvent} from '../../runtime-events';
import {nativeFiberChain} from './native-model-menu';

type Fiber = Record<string, any>;
type Banner = {node: HTMLElement; fiber: Fiber; key: string};
type Lease = Banner & {button: HTMLButtonElement; owned: boolean; abort: AbortController; token: string};

const CARD = 'data-code-codex-usage-banner';
const HIDDEN = 'data-code-codex-usage-banner-hidden';
const CLOSE = 'data-code-codex-usage-banner-close';
const dismissals = new WeakMap<Document, Set<string>>();
const css = `
[${CARD}]{position:relative!important;padding-inline-end:44px!important}
[${HIDDEN}]{display:none!important}
[${CLOSE}]{position:absolute!important;inset:8px 8px auto auto!important;margin:0!important;z-index:1}
[${CLOSE}="owned"]{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:6px;border:0;border-radius:6px;background:transparent;color:var(--color-text-secondary,currentColor);font:inherit;cursor:pointer;-webkit-app-region:no-drag}
[${CLOSE}="owned"]:hover{background:var(--color-background-primary-ghost-hover,rgba(128,128,128,.12))}
[${CLOSE}="owned"]:focus-visible{outline:2px solid var(--color-text-accent,#1683cf);outline-offset:2px}
[${CLOSE}="owned"] svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
`;

function subtree(root: Fiber, budget: number): Fiber[] {
  const result: Fiber[] = [];
  const stack = [root];
  while (stack.length) {
    const fiber = stack.pop()!;
    if (result.length >= budget) throw Error('ACCOUNT_USAGE_BANNER_UNAVAILABLE: stage=tree-budget');
    result.push(fiber);
    if (fiber !== root && fiber.sibling) stack.push(fiber.sibling);
    if (fiber.child) stack.push(fiber.child);
  }
  return result;
}

function bannerKey(owner: string, conversation: string | null, status: Fiber): string | undefined {
  const banner = status.rate_limit_upsell;
  const identity = status.account_id || status.user_id;
  if (typeof identity !== 'string' || !identity || identity.length > 256 ||
      typeof banner?.banner_type !== 'string' || banner.banner_type.length > 128 ||
      !Array.isArray(banner.ctas) || banner.banner_type === 'image_generation_limit_reached') return;
  if (banner.reset_at != null && (typeof banner.reset_at !== 'number' || !Number.isFinite(banner.reset_at))) return;
  return JSON.stringify([owner, conversation, identity, banner.banner_type, banner.model_slug ?? null, banner.reset_at ?? null]);
}

function usageStatus(fiber: Fiber): Fiber | undefined {
  if (typeof fiber.type !== 'function') return;
  const props = fiber.memoizedProps;
  if (typeof props?.sendBlocked !== 'boolean' || props.imageGenerationLimit) return;
  if (typeof props.canShowUsageBanners === 'boolean') return props.rateLimit;
  const status = props.rateLimitStatus;
  if (props.banner && props.banner === status?.rate_limit_upsell) return status;
}

function findBanners(anchor: HTMLButtonElement, owner: string, conversation: string | null): Banner[] {
  const composer = anchor.closest('[data-codex-composer-root]');
  if (!composer) return [];
  const chain = nativeFiberChain(composer as HTMLElement);
  const owners = conversation ? chain.filter(fiber =>
    typeof fiber.type === 'function' && fiber.memoizedProps?.conversationId === conversation) : [];
  const root = owners.at(-1) ?? chain[0];
  const result: Banner[] = [];
  for (const fiber of subtree(root, 20_000)) {
    const status = usageStatus(fiber);
    if (!status) continue;
    const key = bannerKey(owner, conversation, status);
    if (!key) continue;
    const card = subtree(fiber, 512).filter(child => {
      const props = child.memoizedProps;
      return typeof child.type === 'function' && typeof props?.stackOnNarrow === 'boolean' &&
        'title' in props && 'content' in props && 'customCtas' in props;
    });
    if (card.length !== 1) throw Error('ACCOUNT_USAGE_BANNER_UNAVAILABLE: stage=card-contract');
    // Providers may contribute display:contents hosts with no painted box.
    // Anchor the close to the actual rendered card underneath those wrappers.
    const node = subtree(card[0]!, 256).map(child => child.stateNode).find(node => {
      if (!(node instanceof HTMLElement) || !node.isConnected) return false;
      if (node.hasAttribute(CARD)) return true;
      const bounds = node.getBoundingClientRect();
      return bounds.width > 0 && bounds.height > 0;
    });
    if (node?.isConnected && !node.closest('[data-app-shell-active-page="false"],[aria-hidden="true"]')) {
      const existing = result.find(banner => banner.node === node);
      if (existing && existing.key !== key) throw Error('ACCOUNT_USAGE_BANNER_UNAVAILABLE: stage=card-identity');
      if (!existing) result.push({node, fiber, key});
    }
  }
  // A duplicate host surface cannot be safely assigned to this composer.
  if (result.length > 1) throw Error('ACCOUNT_USAGE_BANNER_UNAVAILABLE: stage=ambiguous-banner');
  return result;
}

function nativeClose(banner: Banner): HTMLButtonElement | undefined {
  const fibers = subtree(banner.fiber, 1024);
  const callbacks = new Set(fibers.filter(fiber =>
    fiber.memoizedProps?.banner && typeof fiber.memoizedProps.onDismiss === 'function')
    .map(fiber => fiber.memoizedProps.onDismiss));
  const buttons: HTMLButtonElement[] = [];
  for (const fiber of fibers) {
    const props = fiber.memoizedProps;
    if (!callbacks.has(props?.onClick)) continue;
    // Native button components can wrap their DOM event handler. Match the
    // original callback at that component and resolve its actual button.
    const button = fiber.stateNode instanceof HTMLButtonElement ? fiber.stateNode :
      typeof props['aria-label'] === 'string' ? subtree(fiber, 128)
        .find(child => child.stateNode instanceof HTMLButtonElement)?.stateNode : undefined;
    if (button && banner.node.contains(button)) buttons.push(button);
  }
  const unique = [...new Set(buttons)];
  if (unique.length > 1) throw Error('ACCOUNT_USAGE_BANNER_UNAVAILABLE: stage=ambiguous-close');
  return unique[0];
}

/** Owns only the qualified usage card's presentation and its close control. */
export class NativeUsageBanner {
  #lease: Lease | undefined;
  #style: HTMLStyleElement | undefined;
  #error = '';
  #closed: Set<string>;
  #anchor: HTMLButtonElement | undefined;
  #conversation: string | null = null;

  constructor(private readonly owner: string, private readonly current: () => boolean) {
    let closed = dismissals.get(document);
    if (!closed) dismissals.set(document, closed = new Set());
    this.#closed = closed;
  }

  get hiddenCount(): number { return this.#lease?.node.hasAttribute(HIDDEN) ? 1 : 0; }

  observes(node: Element): boolean {
    if (node.hasAttribute(CLOSE)) return false;
    if (this.#lease?.node.contains(node)) return true;
    let fiber = (node as any)[Object.keys(node).find(key => key.startsWith('__reactFiber$'))!];
    for (let i = 0; fiber && i < 64; i++, fiber = fiber.return) {
      if (usageStatus(fiber)) return true;
    }
    return false;
  }

  update(anchor: HTMLButtonElement | undefined, conversation: string | null, hideHost: boolean): void {
    this.#anchor = anchor;
    this.#conversation = conversation;
    if (!anchor?.isConnected || !this.current()) { this.#release(); return; }
    try {
      const banner = findBanners(anchor, this.owner, conversation)[0];
      if (!banner) { this.#release(); return; }
      const close = nativeClose(banner);
      const lease = this.#lease;
      if (!lease || lease.node !== banner.node || lease.key !== banner.key ||
          (close && lease.button !== close) || !lease.button.isConnected) {
        this.#release();
        this.#attach(banner, close);
      }
      if (this.#lease!.owned) this.#lease!.button.setAttribute('aria-label', getLocale() === 'zh-CN' ? '关闭额度提示' : 'Dismiss usage banner');
      const hidden = hideHost || this.#closed.has(banner.key);
      if (banner.node.hasAttribute(HIDDEN) !== hidden) banner.node.toggleAttribute(HIDDEN, hidden);
      this.#error = '';
    } catch (error) {
      this.#release();
      const message = String(error);
      if (message !== this.#error) runtimeEvent('accounts', 'account.usage-banner', 'unavailable', {
        stage: 'native-banner-contract', taskSent: false,
      });
      this.#error = message;
    }
  }

  #attach(banner: Banner, native: HTMLButtonElement | undefined): void {
    if (!this.#style) {
      this.#style = document.createElement('style');
      this.#style.textContent = css;
      document.head.append(this.#style);
    }
    const button = native ?? document.createElement('button');
    if (!native) { button.type = 'button'; button.innerHTML = icons.close; }
    const abort = new AbortController();
    const token = crypto.randomUUID();
    const previous = banner.node.getAttribute(CARD);
    if (previous) {
      for (const stale of banner.node.querySelectorAll<HTMLButtonElement>(`[${CLOSE}="owned"]`)) {
        if (stale.dataset.usageBannerOwner === previous) stale.remove();
      }
    }
    const lease: Lease = {...banner, button, owned: !native, abort, token};
    button.setAttribute(CLOSE, native ? 'native' : 'owned');
    button.dataset.usageBannerOwner = token;
    banner.node.setAttribute(CARD, token);
    this.#lease = lease;
    button.addEventListener('click', () => {
      // Let React run the native callback on the same event before hiding.
      queueMicrotask(() => {
        if (!this.current() || this.#lease !== lease || !this.#anchor?.isConnected || lease.node.getAttribute(CARD) !== token) return;
        try {
          const current = findBanners(this.#anchor, this.owner, this.#conversation)[0];
          if (current && current.key !== lease.key) return;
        } catch { return; }
        this.#closed.delete(lease.key);
        this.#closed.add(lease.key);
        if (this.#closed.size > 128) this.#closed.delete(this.#closed.values().next().value!);
        if (lease.node.isConnected) lease.node.setAttribute(HIDDEN, '');
        this.#anchor.focus({preventScroll: true});
      });
    }, {capture: true, signal: abort.signal});
    if (!native) banner.node.append(button);
  }

  #release(): void {
    const lease = this.#lease;
    if (!lease) return;
    lease.abort.abort();
    if (lease.node.getAttribute(CARD) === lease.token) {
      lease.node.removeAttribute(CARD);
      lease.node.removeAttribute(HIDDEN);
    }
    if (lease.button.dataset.usageBannerOwner === lease.token) {
      lease.button.removeAttribute(CLOSE);
      delete lease.button.dataset.usageBannerOwner;
    }
    if (lease.owned) lease.button.remove();
    this.#lease = undefined;
  }

  dispose(): void { this.#release(); this.#style?.remove(); this.#style = undefined; }
}
