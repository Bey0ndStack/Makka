export function isSameRequestOrigin(
  origin: string | null,
  requestUrl: URL,
  headers: Pick<Headers, "get">
) {
  if (!origin) return true;

  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    return false;
  }
  if (parsedOrigin.protocol !== "http:" && parsedOrigin.protocol !== "https:") return false;

  const allowedHosts = [
    requestUrl.host,
    headers.get("host"),
    headers.get("x-forwarded-host")?.split(",")[0]?.trim()
  ].filter((host): host is string => Boolean(host)).map((host) => host.toLowerCase());

  return allowedHosts.includes(parsedOrigin.host.toLowerCase());
}
