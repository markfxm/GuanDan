import { describe, expect, it } from "vitest";
import { AtomicD1Writer } from "./d1AtomicWriter";

describe("D1 atomic writer", () => {
  it("writes a validated batch before updating manifest", async () => {
    const writes: string[] = []; const renames: string[] = [];
    const writer = new AtomicD1Writer({ write: async (file, value) => { writes.push(`${file}:${value}`); }, rename: async (from, to) => { renames.push(to); }, remove: async () => {} });
    await writer.writeBatch("batch.json", "{}", "manifest.json", "{\"completed\":1}");
    expect(renames).toEqual(["batch.json", "manifest.json"]);
  });

  it("cleans the temporary write and preserves manifest on rename failure", async () => {
    const removed: string[] = [];
    const writer = new AtomicD1Writer({ write: async () => {}, rename: async () => { throw new Error("RENAME"); }, remove: async (file) => { removed.push(file); } });
    await expect(writer.writeBatch("batch.json", "{}", "manifest.json", "{}")).rejects.toThrow("RENAME");
    expect(removed.length).toBeGreaterThan(0);
  });
});
