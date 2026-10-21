export type Report = { id: string; kind: "seo" | "table" | "ahrefs"; title?: string; name?: string; provider?: string; site?: string; createdAt?: string; [key: string]: unknown };
export type Page<T> = { data: T[]; pagination: { nextCursor: string | null; hasMore: boolean } };

export function toolPayload(result: Record<string, unknown>): Record<string, unknown> {
  if (result.isError) throw new Error("Netiker could not read this data. Check your access and Data API limits in the workspace.");
  if (result.structuredContent && typeof result.structuredContent === "object") return result.structuredContent as Record<string, unknown>;
  const content = result.content as { type: string; text?: string }[] | undefined;
  const text = content?.find(item => item.type === "text")?.text;
  if (!text) throw new Error("Netiker returned an empty response.");
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Netiker response.");
  return value as Record<string, unknown>;
}

export function reportReference(value: unknown): Report {
  const item = value as Partial<Report> | undefined;
  if (!item || !["seo", "table", "ahrefs"].includes(item.kind || "") || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(item.id || "")) throw new Error("Select a report in the Netiker sidebar first.");
  return item as Report;
}

export function callbackCode(url: URL, expectedState: string): string {
  if (url.pathname !== "/callback" || url.searchParams.get("state") !== expectedState) throw new Error("Invalid authorization callback.");
  if (url.searchParams.has("error")) throw new Error("Netiker authorization was declined.");
  const code = url.searchParams.get("code");
  if (!code || code.length > 4096) throw new Error("Missing authorization code.");
  return code;
}
