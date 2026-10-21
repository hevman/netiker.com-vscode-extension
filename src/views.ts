import * as vscode from "vscode";
import { NetikerClient } from "./client";
import { NetikerAuth } from "./auth";
import { type Page, type Report, reportReference } from "./protocol";

export class DataItem extends vscode.TreeItem {
  constructor(label: string, readonly report?: Report, readonly cursor?: string, readonly detail?: unknown) {
    super(label);
    if (report) {
      this.description = [report.provider, report.property].filter(Boolean).join(" · ");
      this.tooltip = [report.title, report.property, report.createdAt].filter(Boolean).join("\n");
      this.contextValue = "report";
      this.iconPath = new vscode.ThemeIcon("graph");
      this.command = { command: "netiker.openReport", title: "Open report", arguments: [this] };
    } else if (cursor) {
      this.iconPath = new vscode.ThemeIcon("chevron-down");
      this.command = { command: "netiker.loadMore", title: "Load more", arguments: [this] };
    }
  }
}

export class DataView implements vscode.TreeDataProvider<DataItem> {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  private items: DataItem[] | undefined;
  private next: string | null = null;
  private loading?: Promise<void>;
  private generation = 0;
  constructor(private readonly client: NetikerClient, private readonly auth: NetikerAuth, readonly kind: "reports" | "runs") {}
  getTreeItem(item: DataItem) { return item; }
  async getChildren() {
    if (!this.auth.signedIn) return [];
    if (!this.items) await this.load();
    const values = [...(this.items || [])];
    if (this.next) {
      const more = new DataItem("Load more…", undefined, this.next);
      more.command = { command: this.kind === "reports" ? "netiker.loadMore" : "netiker.loadMoreRuns", title: "Load more", arguments: [more] };
      values.push(more);
    }
    return values;
  }
  async load(cursor?: string) {
    if (this.loading) return this.loading;
    const generation = this.generation;
    this.loading = (async () => {
      try {
        const page = await this.client.call(this.kind === "reports" ? "list_reports" : "list_sync_runs", { limit: 30, ...(cursor ? { cursor } : {}) }) as unknown as Page<Record<string, unknown>>;
        if (generation !== this.generation) return;
        if (!Array.isArray(page.data) || !page.pagination) throw new Error("Unexpected Netiker response.");
        const rows = page.data.map(value => {
          if (this.kind === "reports") {
            const report = reportReference(value);
            return new DataItem(String(report.title || report.property || report.id), report);
          }
          const item = new DataItem(String(value.provider || "Synchronization"), undefined, undefined, value);
          item.description = `${value.status || "unknown"} · ${value.createdAt || ""}`;
          item.iconPath = new vscode.ThemeIcon(value.status === "completed" ? "pass" : value.status === "failed" ? "error" : "history");
          item.command = { command: "netiker.openRun", title: "Open synchronization details", arguments: [value] };
          return item;
        });
        this.items = cursor ? [...(this.items || []), ...rows] : rows;
        if (!this.items.length) this.items = [new DataItem(this.kind === "reports" ? "No saved reports. Add a source in Netiker." : "No synchronization history.")];
        this.next = page.pagination.nextCursor;
      } catch (error) {
        if (generation === this.generation) {
          this.items ??= [new DataItem("Could not load data. Use Reload to retry.")];
          void vscode.window.showErrorMessage(error instanceof Error ? error.message : "Could not load Netiker data.");
        }
      }
    })().finally(() => { this.loading = undefined; this.changed.fire(); });
    return this.loading;
  }
  reset() { this.generation++; this.items = undefined; this.next = null; this.changed.fire(); }
  dispose() { this.changed.dispose(); }
}
