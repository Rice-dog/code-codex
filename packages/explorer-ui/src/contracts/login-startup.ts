export interface LoginStartupStatus {
  supported: boolean;
  enabled: boolean;
}

export interface LoginStartupActions {
  getLoginStartup(): Promise<LoginStartupStatus>;
  setLoginStartup(enabled: boolean): Promise<LoginStartupStatus>;
}
