/** Diagnostic minimization, not a claim to recognize arbitrary private prose. */
const privateKey = /(token|cookie|password|secret|credential|authorization|apikey)/i;
const omittedKey = /^(content|text|body|prompt|messages|title|filename|name|raw|data|database64|commandline|sessionid|accountid|threadid|projectid)$|(?:path|url|uri)$/i;

export function redactRuntimeText(input: string): string {
  const bounded = input.slice(0, 8000);
  return bounded
    .replace(/\b[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s"'<>]+/g, value => {
      try {
        const url = new URL(value);
        if (["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) && !url.username && !url.password && ["/json/version", "/json/list", "/"].includes(url.pathname)) return `${url.origin}${url.pathname}`;
      } catch { /* Omit malformed URLs as well. */ }
      return "[url]";
    })
    .replace(/(?:\b[A-Za-z]:[\\/]|\\\\|\/(?:Users|home|tmp|var|etc|opt|mnt)\/|~\/)[^\r\n"'<>]*/g, "[path]")
    .replace(/\b(?:Bearer\s+\S+|(?:authorization|password|secret|(?:access[_-]?|refresh[_-]?)?token|api[_-]?key|cookie)\s*[:=]\s*[^,;\r\n]+)/gi, "[credential]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[credential]")
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[email]")
    .slice(0, 4000) + (input.length > 8000 ? " [truncated]" : "");
}

export function redactRuntimeValue(input: unknown): unknown {
  let budget = 256;
  const seen = new WeakSet<object>();
  const visit = (value: unknown, depth: number): unknown => {
    if (--budget < 0 || depth > 6) return "[truncated]";
    if (typeof value === "string") return redactRuntimeText(value);
    if (value === null || typeof value === "boolean" || typeof value === "number") return value;
    if (typeof value !== "object") return "[unsupported]";
    if (seen.has(value)) return "[circular]";
    seen.add(value);
    if (value instanceof Error) return { name: redactRuntimeText(value.name), message: redactRuntimeText(value.message) };
    if (Array.isArray(value)) return value.slice(0, 128).map(v => visit(v, depth + 1));
    const result: Record<string, unknown> = Object.create(null);
    for (const [key, field] of Object.entries(value).slice(0, 128)) {
      const normalized = key.replace(/[^a-z0-9]/gi, "");
      result[redactRuntimeText(key).slice(0, 160)] = privateKey.test(normalized) || omittedKey.test(normalized) ? "[redacted]" : visit(field, depth + 1);
    }
    return result;
  };
  try { return visit(input, 0); } catch { return { redactionFailed: true }; }
}
