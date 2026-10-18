import { it, expect } from "vitest";
import { parseHistoryQuery } from "./history";
it("accepts first, older and newer page cursors", () => {
  expect(parseHistoryQuery({})).toEqual({});
  expect(parseHistoryQuery({ versionId: "12345678-1234-1234-1234-123456789abc", beforeVersion: "36" })).toMatchObject({ beforeVersion: 36 });
  expect(parseHistoryQuery({ afterVersion: 5 })).toEqual({ afterVersion: 5 });
});
it.each([0, -1, 1.2, "", "abc", "01", "1e2", " 1", "2147483648", null, true, []])("rejects malformed cursor %j", value => {
  expect(() => parseHistoryQuery({ beforeVersion: value })).toThrow();
});
it("rejects both directions or invalid curriculum IDs", () => {
  expect(() => parseHistoryQuery({ beforeVersion: 5, afterVersion: 1 })).toThrow("หนึ่งทาง");
  expect(() => parseHistoryQuery({ versionId: "not-an-id" })).toThrow("รหัส");
});
