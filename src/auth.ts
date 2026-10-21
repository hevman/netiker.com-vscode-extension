import * as vscode from "vscode";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { auth, type OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthClientInformationMixed, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import { callbackCode } from "./protocol";

export const endpoint = "https://app.netiker.com/mcp";
const origin = "https://app.netiker.com";
type Stored = { client?: OAuthClientInformationMixed; tokens?: OAuthTokens; redirect?: string };

export class NetikerAuth implements OAuthClientProvider {
  private stored: Stored = {};
  private verifier = "";
  private pendingState = "";
  private interactive = false;
  private pending?: Promise<void>;
  private cancelLogin?: () => void;
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changed.event;
  constructor(private readonly secrets: vscode.SecretStorage) {}
  async load() {
    const value = await this.secrets.get("netiker.oauth");
    if (value) { try { this.stored = JSON.parse(value) as Stored; } catch { await this.secrets.delete("netiker.oauth"); } }
  }
  get signedIn() { return Boolean(this.stored.tokens); }
  get redirectUrl() { return this.stored.redirect || "http://127.0.0.1/callback"; }
  get clientMetadata() {
    return { client_name: "Netiker for Visual Studio Code", client_uri: "https://netiker.com", redirect_uris: [this.redirectUrl], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none", scope: "reports:read runs:read" };
  }
  state() { return this.pendingState; }
  clientInformation() { return this.stored.client; }
  async saveClientInformation(client: OAuthClientInformationMixed) { this.stored.client = client; await this.save(); }
  tokens() { return this.stored.tokens; }
  async saveTokens(tokens: OAuthTokens) { const wasSignedIn = this.signedIn; this.stored.tokens = tokens; await this.save(); if (!wasSignedIn) this.changed.fire(); }
  saveCodeVerifier(value: string) { this.verifier = value; }
  codeVerifier() { if (!this.verifier) throw new Error("Authorization expired. Sign in again."); return this.verifier; }
  async redirectToAuthorization(url: URL) {
    if (!this.interactive) throw new Error("Sign in to Netiker using the sidebar first.");
    if (url.origin !== origin || url.pathname !== "/oauth/authorize") throw new Error("Unexpected authorization endpoint.");
    if (!await vscode.env.openExternal(vscode.Uri.parse(url.href))) throw new Error("Could not open your browser.");
  }
  async invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier" | "discovery") {
    if (scope === "all" || scope === "client") delete this.stored.client;
    if (scope === "all" || scope === "tokens") delete this.stored.tokens;
    if (scope === "all" || scope === "verifier") this.verifier = "";
    await this.save(); this.changed.fire();
  }
  private save() { return this.secrets.store("netiker.oauth", JSON.stringify(this.stored)); }
  signIn() {
    if (!this.pending) this.pending = this.login().finally(() => { this.pending = undefined; });
    return this.pending;
  }
  private async login() {
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Sign in to Netiker in your browser", cancellable: true }, async (_progress, cancellation) => {
      this.pendingState = randomBytes(32).toString("base64url");
      let complete!: (code: string) => void;
      let fail!: (error: Error) => void;
      const callback = new Promise<string>((resolve, reject) => { complete = resolve; fail = reject; });
      this.cancelLogin = () => fail(new Error("Sign-in cancelled."));
      // Attach a rejection handler immediately, including while discovery is in progress.
      void callback.catch(() => {});
      const server = createServer((req, res) => {
        try {
          if (req.method !== "GET") { res.writeHead(405).end(); return; }
          const url = new URL(req.url || "/", this.redirectUrl);
          if (url.pathname !== "/callback") { res.writeHead(404).end(); return; }
          // Unrelated local requests cannot cancel or complete the active login.
          if (url.searchParams.get("state") !== this.pendingState) { res.writeHead(400).end("Invalid state."); return; }
          const code = callbackCode(url, this.pendingState);
          res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'" }).end("Return to Visual Studio Code to finish connecting Netiker.");
          complete(code);
        } catch { res.writeHead(400).end("Authorization declined or invalid. Return to VS Code."); fail(new Error("Netiker authorization was declined or invalid.")); }
      });
      const timer = setTimeout(() => fail(new Error("Sign-in timed out. Please try again.")), 180_000);
      const subscription = cancellation.onCancellationRequested(() => fail(new Error("Sign-in cancelled.")));
      try {
        await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
        const address = server.address();
        if (!address || typeof address === "string") throw new Error("Could not start the authorization callback.");
        this.stored = { redirect: `http://127.0.0.1:${address.port}/callback` };
        this.interactive = true;
        const result = await auth(this, { serverUrl: endpoint, scope: "reports:read runs:read", fetchFn: timedFetch });
        if (result !== "AUTHORIZED") {
          const code = await callback;
          await auth(this, { serverUrl: endpoint, authorizationCode: code, scope: "reports:read runs:read", fetchFn: timedFetch });
        }
      } finally {
        clearTimeout(timer); subscription.dispose(); this.interactive = false; this.verifier = ""; this.pendingState = ""; this.cancelLogin = undefined;
        server.close(); server.closeAllConnections();
      }
    });
  }
  async signOut() {
    this.cancelLogin?.();
    await this.pending?.catch(() => {});
    const token = this.stored.tokens?.refresh_token || this.stored.tokens?.access_token;
    const clientId = this.stored.client?.client_id;
    try {
      if (token && clientId) {
        const result = await timedFetch(origin + "/oauth/revoke", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token, client_id: clientId }) });
        if (!result.ok) throw new Error("revocation_failed");
      }
    } catch {
      void vscode.window.showWarningMessage("Local sign-in was removed. Revoke the VS Code connection in your Netiker account to ensure server access is closed.");
    } finally {
      this.stored = {}; await this.secrets.delete("netiker.oauth"); this.changed.fire();
    }
  }
  dispose() { this.cancelLogin?.(); this.changed.dispose(); }
}

export const timedFetch: typeof fetch = (input, init) => fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000) });
