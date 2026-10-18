import { afterEach, expect, it, vi } from "vitest";
import { assertTestDatabase } from "../../tests/support/fixtures";
import { getDatabase } from "./database";
vi.mock("./database", () => ({ getDatabase: vi.fn(() => { throw new Error("Client must not be created by guard"); }) }));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it.each(["postgresql://localhost/aps_v2", "postgresql://example.invalid/aps_v2_test", "postgresql://localhost/aps_v2_test_other", ""])("refuses unsafe fixture target without creating a client: %s", url => {
  vi.stubEnv("DATABASE_URL", url); expect(() => assertTestDatabase()).toThrow(); expect(getDatabase).not.toHaveBeenCalled();
});
it.each(["postgresql://localhost/aps_v2_test", "postgresql://127.0.0.1/aps_v2_test"])("allows only the named local test database: %s", url => {
  vi.stubEnv("DATABASE_URL", url); expect(() => assertTestDatabase()).not.toThrow(); expect(getDatabase).not.toHaveBeenCalled();
});
