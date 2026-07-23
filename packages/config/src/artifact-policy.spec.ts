import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  findDockerIgnorePolicyGaps,
  isAllowedRepositoryExample,
  isSensitiveArtifact,
} from "./artifact-policy";

describe("repository artifact policy", () => {
  it.each([
    "tenant-certificate.pfx",
    "certs/company.p12",
    "private/server.pem",
    "private/server.key",
    "backups/backup.sql",
    "backups/predeploy.sql.gz",
    ".env",
    "apps/api/.env.production",
    "uploads/customer-logo.png",
    "backup/tenant.backup.sql",
    "dump/tenant.dump.sql",
    ".envrc",
    "private/cookies.json",
    "private/cookiejar.txt",
    "C:\\exports\\tenant.backup.sql",
  ])("blocks sensitive artifact %s", (path) => {
    expect(isSensitiveArtifact(path)).toBe(true);
  });

  it.each([".env.example", ".env.production.example", ".env.preview.example"])(
    "allows documented environment example %s",
    (path) => {
      expect(isAllowedRepositoryExample(path)).toBe(true);
      expect(isSensitiveArtifact(path)).toBe(false);
    },
  );

  it("does not block source maps needed by the observability pipeline", () => {
    expect(isSensitiveArtifact("apps/web/.next/server/app.js.map")).toBe(false);
  });

  it("does not block source migrations", () => {
    expect(isSensitiveArtifact("packages/db/migrations/0060_price_policy_margin.sql")).toBe(false);
    expect(isSensitiveArtifact("packages/db/migrations/0061_backup_policy.sql")).toBe(false);
    expect(isSensitiveArtifact("packages/db/migrations/0062_dump_restore.sql")).toBe(false);
  });

  it("keeps every sensitive artifact family outside the Docker context", () => {
    const dockerIgnore = readFileSync(resolve(__dirname, "../../../.dockerignore"), "utf8");
    expect(findDockerIgnorePolicyGaps(dockerIgnore)).toEqual([]);
  });

  it("rejects Docker negations that would re-include sensitive files", () => {
    const dockerIgnore = readFileSync(resolve(__dirname, "../../../.dockerignore"), "utf8");
    expect(findDockerIgnorePolicyGaps(`${dockerIgnore}\n!private.pem\n`)).toContain("!private.pem");
    expect(findDockerIgnorePolicyGaps(`${dockerIgnore}\n!*.env\n`)).toContain("!*.env");
    expect(findDockerIgnorePolicyGaps(`${dockerIgnore}\n!*.env.*\n`)).toContain("!*.env.*");
    expect(findDockerIgnorePolicyGaps(`${dockerIgnore}\n!cookies.*\n`)).toContain("!cookies.*");
    expect(findDockerIgnorePolicyGaps(`${dockerIgnore}\n!.env.example\n`)).not.toContain(
      "!.env.example",
    );
  });
});
