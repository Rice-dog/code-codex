import type { LoginStartupActions, LoginStartupStatus } from '../../contracts/login-startup';
import { t } from '../../i18n';
import { ApplicationDialog } from '../../components/application-dialog';

/** Owns the menu control only; no optimistic OS state or reconnect write replay. */
export class LoginStartupController {
  private state: LoginStartupStatus | undefined;
  private pending = false;
  private disposed = false;
  private failed = false;
  private readonly dialog = new ApplicationDialog();
  private readonly label = document.createElement('span');
  private readonly check = document.createElement('span');

  constructor(private readonly button: HTMLButtonElement, private readonly actions: LoginStartupActions) {
    button.setAttribute('role', 'menuitemcheckbox');
    button.dataset.codeCodexLoginStartup = 'true';
    this.check.dataset.codeCodexMenuCheck = 'true';
    this.check.setAttribute('aria-hidden', 'true');
    this.check.textContent = '✓';
    button.append(this.label, this.check);
    this.render();
  }

  render(): void {
    this.label.textContent = t(this.failed ? 'loginStartup.revoke' : 'loginStartup.label');
    this.check.hidden = !this.state?.enabled;
    this.button.setAttribute('aria-checked', String(this.state?.enabled ?? false));
    this.button.setAttribute('aria-busy', String(this.pending));
    this.button.disabled = this.pending || (!this.failed && (!this.state || !this.state.supported));
    this.button.title = t(this.failed ? 'loginStartup.failed' : this.state?.supported ? 'loginStartup.hint' : 'loginStartup.unavailable');
  }

  private accept(value: LoginStartupStatus): void {
    if (typeof value?.enabled !== 'boolean' || typeof value?.supported !== 'boolean') throw new Error('Invalid login startup response');
    this.state = value;
    this.failed = false;
  }

  async refresh(): Promise<void> {
    if (this.pending || this.disposed) return;
    this.pending = true;
    this.render();
    try {
      const value = await this.actions.getLoginStartup();
      if (!this.disposed) this.accept(value);
    } catch {
      // If inspection fails, expose only explicit revocation, never guess that
      // a fresh enable is safe. The CLI provides the same recovery command.
      if (!this.disposed) { this.state = undefined; this.failed = true; }
    } finally {
      this.pending = false;
      if (!this.disposed) this.render();
    }
  }

  async toggle(): Promise<void> {
    if (this.button.disabled || this.pending || this.disposed) return;
    const enabled = this.failed ? false : !this.state?.enabled;
    this.pending = true;
    this.render();
    try {
      if (enabled && !await this.dialog.confirm('loginStartup.title', 'loginStartup.confirm')) return;
      if (this.disposed) return;
      const value = await this.actions.setLoginStartup(enabled);
      if (!this.disposed) this.accept(value);
    } catch (error) {
      if (!this.disposed) {
        this.state = undefined;
        this.failed = true;
        window.alert(`Login startup could not be confirmed. Click the menu item to turn it off, or use code-codex login-startup --disable.\n${String(error)}`);
      }
    } finally {
      this.pending = false;
      if (!this.disposed) this.render();
    }
  }

  dispose(): void { this.disposed = true; this.dialog.dispose(); }
}
