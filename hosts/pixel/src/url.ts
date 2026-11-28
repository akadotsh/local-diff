export function viewerURL(value: string | undefined): string {
  if (!value) throw new Error("Usage: npm start -- http://127.0.0.1:PORT");
  const url = new URL(value);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.username || url.password)
    throw new Error("Expected a local HTTP RPD viewer URL");
  return url.href;
}
