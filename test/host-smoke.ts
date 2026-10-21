import * as vscode from "vscode";
import { strict as assert } from "node:assert";
import { writeFile } from "node:fs/promises";
import { DataView } from "../src/views";
import type { NetikerClient } from "../src/client";
import type { NetikerAuth } from "../src/auth";

export async function run() {
  try {
    const extension = vscode.extensions.getExtension("hevman.netiker");
    assert.ok(extension, "Extension is discoverable");
    await extension.activate();
    assert.equal(extension.isActive, true);
    const commands = await vscode.commands.getCommands(true);
    for (const id of ["netiker.signIn", "netiker.signOut", "netiker.refresh", "netiker.openReport", "netiker.askCopilot", "netiker.readRows"]) assert.ok(commands.includes(id), id);
    assert.equal(typeof vscode.lm.registerMcpServerDefinitionProvider, "function");
    await vscode.commands.executeCommand("netiker.refresh");
    // Exercise actual VS Code TreeItems and events against bounded service fixtures.
    const calls: string[] = [];
    const fakeClient = { call: async (tool: string) => { calls.push(tool); return { data: [], pagination: { nextCursor: "next", hasMore: true } }; } } as unknown as NetikerClient;
    const signedIn = { signedIn: true } as NetikerAuth;
    const history = new DataView(fakeClient, signedIn, "runs");
    const items = await history.getChildren();
    assert.equal(calls[0], "list_sync_runs");
    assert.equal(items.at(-1)?.command?.command, "netiker.loadMoreRuns");
    assert.equal(items.at(-1)?.cursor, "next");
    history.dispose();
    const reportView = new DataView(fakeClient, signedIn, "reports");
    const reportItems = await reportView.getChildren();
    assert.equal(calls[1], "list_reports");
    assert.equal(reportItems.at(-1)?.command?.command, "netiker.loadMore");
    reportView.dispose();
    const signedOutView = new DataView(fakeClient, { signedIn: false } as NetikerAuth, "reports");
    assert.deepEqual(await signedOutView.getChildren(), []);
    assert.equal(calls.length, 2, "Signed-out views must not access account data");
    signedOutView.dispose();
    await writeFile(process.env.NETIKER_SMOKE_RESULT!, JSON.stringify({ success: true, version: vscode.version, commands: commands.filter(id => id.startsWith("netiker.")) }));
  } catch (error) {
    await writeFile(process.env.NETIKER_SMOKE_RESULT!, JSON.stringify({ success: false, error: String(error) }));
    throw error;
  }
}
