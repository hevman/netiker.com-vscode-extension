import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { NetikerAuth, endpoint, timedFetch } from "./auth";
import { toolPayload } from "./protocol";

export class NetikerClient {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly auth: NetikerAuth) {}
  exclusive<T>(action: () => Promise<T>): Promise<T> {
    const result = this.queue.then(action);
    this.queue = result.catch(() => {});
    return result;
  }
  call(name: string, args: Record<string, unknown> = {}) {
    // Refresh tokens rotate: serialize calls to prevent simultaneous refresh reuse.
    return this.exclusive(async () => {
      if (!this.auth.signedIn) throw new Error("Sign in to Netiker using the sidebar first.");
      const client = new Client({ name: "netiker-vscode", version: "0.1.0" });
      const transport = new StreamableHTTPClientTransport(new URL(endpoint), { authProvider: this.auth, fetch: timedFetch });
      try {
        await client.connect(transport);
        return toolPayload(await client.callTool({ name, arguments: args }) as Record<string, unknown>);
      } finally { await client.close(); }
    });
  }
}
