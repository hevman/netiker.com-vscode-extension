# Netiker for Visual Studio Code

Browse your saved Netiker reports and synchronization history in VS Code. Connect Netiker's read-only MCP tools to GitHub Copilot to discuss real data from Google Search Console, Bing Webmaster Tools, Ahrefs and your other connected sources.

## Install

Download the `.vsix` package from this repository's [Releases](https://github.com/hevman/netiker.com-vscode-extension/releases), or the **netiker-vsix** artifact from [GitHub Actions](https://github.com/hevman/netiker.com-vscode-extension/actions). In VS Code, open Extensions → **…** → **Install from VSIX…** and select the file.

Requires desktop VS Code 1.109 or newer. Windows, macOS and Linux are supported by the package. This extension is not currently listed in the Visual Studio Marketplace. Web-only VS Code is not supported.

## Browse reports

1. Open the Netiker icon in the Activity Bar.
2. Choose **Sign in**. Your browser opens Netiker; sign in and approve read access.
3. Return to VS Code. Reports and synchronization history load from your account.
4. Select a report to inspect its metadata. Use its table action to read rows, or the conversation action to ask Copilot.

The sidebar uses browser OAuth with PKCE and a temporary loopback callback bound to `127.0.0.1`. Tokens and client registration are stored in VS Code SecretStorage, not workspace files or settings. No GSC, Bing or Ahrefs keys are requested by the extension.

**Reload saved reports** re-reads Netiker data; it does not refresh an upstream provider. Lists support pagination. Row previews show at most 100 rows per page and offer explicit next-page loading. Empty, failed and signed-out states are distinct.

## GitHub Copilot

The extension registers a **Netiker** HTTP MCP server. In Copilot Chat's agent mode, enable its tools and approve the connection when VS Code asks. You may need to start the server through **MCP: List Servers**. Copilot's authentication is managed by VS Code separately from the sidebar; browser approval may be requested again. Copilot access requires a suitable Copilot account and an administrator policy that permits MCP.

Available tools:

| Tool | Purpose |
| --- | --- |
| `list_reports` | Find saved reports, with pagination and provider filters |
| `get_report` | Inspect fields, dates, freshness and limitations |
| `read_report_rows` | Read a bounded page of report rows |
| `list_sync_runs` | Read synchronization history |

Example: “Use Netiker to compare my GSC and Bing reports for the same period. Explain missing data and do not combine Ahrefs traffic estimates with measured clicks.”

The conversation action inserts validated report identifiers and analysis instructions. Report contents are fetched only when you or Copilot invoke tools. Copilot's standard tool approval and model settings apply.

## Privacy and access

The extension contacts `https://app.netiker.com` for authentication and read-only MCP requests. There is no extension telemetry, filesystem scanning or background polling. Data API plan limits apply to reads. Data may be sent to your configured AI service when you use Copilot tools. Provider keys remain in Netiker.

Sign out from the sidebar to revoke its OAuth token and remove local credentials. Copilot maintains a separate connection: remove it through VS Code's MCP/authentication controls, or revoke its grant in your Netiker account. JSON documents are opened as unsaved previews; saving them writes private report data to a location you choose.

For Remote SSH, WSL and containers, the extension prefers running on your desktop so its local browser callback stays reachable. If your environment forces it to run remotely, use the browser workspace or the native MCP connection instead.

[Netiker workspace](https://app.netiker.com/) · [Privacy](https://netiker.com/privacy) · [Terms](https://netiker.com/terms) · [Report an issue](https://github.com/hevman/netiker.com-vscode-extension/issues)

## Development

```sh
npm ci
npm run check
npm test
npm run package
```

Press F5 in this repository to launch an Extension Development Host after building. Generated packages are written to `artifacts/`. The repository publisher identifier is `hevman`; publishing to the Marketplace requires ownership of that publisher and a separate authenticated publishing step.

This repository does not grant an open-source license. See [LICENSE](LICENSE). Third-party dependencies retain their own licenses.
