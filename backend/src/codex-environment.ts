const blockedVariables = new Set([
  "OPENAI_API_KEY",
  "CODEX_API_KEY",
  "OPENAI_BASE_URL",
]);

const allowedCodexVariables = new Set(["CODEX_HOME", "CODEX_MODEL"]);

export function localCodexEnvironment() {
  return Object.fromEntries(
    Object.entries(process.env).filter(([key, value]) => {
      if (value === undefined || blockedVariables.has(key)) return false;
      if (key.startsWith("CODEX_") && !allowedCodexVariables.has(key)) return false;
      return true;
    }),
  ) as Record<string, string>;
}
