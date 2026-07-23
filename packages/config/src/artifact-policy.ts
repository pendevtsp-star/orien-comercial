const allowedEnvironmentExamples = new Set([
  ".env.example",
  ".env.production.example",
  ".env.preview.example",
]);

const allowedDockerNegations = new Set(
  [...allowedEnvironmentExamples].map((fileName) => `!${fileName}`),
);

const blockedDirectories = new Set([
  "backup",
  "backups",
  "certificates",
  "certs",
  "docker-data",
  "dump",
  "dumps",
  "tmp",
  "uploads",
]);

const requiredDockerIgnoreRules = [
  ".env",
  ".env.*",
  ".envrc",
  "uploads",
  "docker-data",
  "tmp",
  "cookies.txt",
  "cookies.json",
  "cookiejar.txt",
  "backup",
  "backups",
  "dump",
  "dumps",
  "certs",
  "certificates",
  "*.pfx",
  "*.p12",
  "*.pem",
  "*.key",
  "*.bak",
  "*.dump",
  "*.sql.gz",
  "backup*.sql",
  "dump*.sql",
  "**/*.backup.sql",
  "**/*.dump.sql",
];

const blockedExtensions = [".bak", ".dump", ".key", ".p12", ".pem", ".pfx", ".sql.gz"];

function normalizePath(filePath: string): string {
  return filePath.trim().replaceAll("\\", "/").replace(/^\.\//, "").toLowerCase();
}

export function isAllowedRepositoryExample(filePath: string): boolean {
  const normalized = normalizePath(filePath);
  const fileName = normalized.split("/").at(-1) ?? normalized;
  return allowedEnvironmentExamples.has(fileName);
}

export function isSensitiveArtifact(filePath: string): boolean {
  const normalized = normalizePath(filePath);
  const segments = normalized.split("/").filter(Boolean);
  const fileName = segments.at(-1) ?? normalized;

  if (isAllowedRepositoryExample(normalized)) {
    return false;
  }

  if (segments.some((segment) => blockedDirectories.has(segment))) {
    return true;
  }

  if (fileName === ".env" || fileName === ".envrc" || fileName.startsWith(".env.")) {
    return true;
  }

  if (
    /^(cookies?|cookiejar)([._-].*)?\.(json|txt)$/.test(fileName) ||
    blockedExtensions.some((extension) => fileName.endsWith(extension))
  ) {
    return true;
  }

  if (normalized.startsWith("packages/db/migrations/") && fileName.endsWith(".sql")) {
    return false;
  }

  return /(^|[._-])(backup|dump)([._-].*)?\.sql$/.test(fileName);
}

export function findDockerIgnorePolicyGaps(dockerIgnore: string): string[] {
  const rules = dockerIgnore
    .split(/\r?\n/)
    .map((line) => line.trim().replaceAll("\\", "/").replace(/\/$/, ""))
    .filter((line) => line.length > 0 && !line.startsWith("#"));
  const configuredRules = new Set(rules.filter((line) => !line.startsWith("!")));
  const riskyNegations = rules.filter(
    (line) => line.startsWith("!") && !allowedDockerNegations.has(line),
  );

  return [
    ...requiredDockerIgnoreRules.filter((rule) => !configuredRules.has(rule)),
    ...riskyNegations,
  ];
}
