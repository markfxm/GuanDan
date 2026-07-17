import { describe, expect, it, vi } from "vitest";
import { createApiShutdown, shutdownApiResources } from "../../src/server/apiShutdown";

describe("API shutdown resource ownership", () => {
  it("closes app and provider once", async () => {
    const app = { close: vi.fn(async () => {}) };
    const provider = { close: vi.fn(() => {}) };
    await shutdownApiResources(app, provider);
    expect(app.close).toHaveBeenCalledTimes(1);
    expect(provider.close).toHaveBeenCalledTimes(1);
  });

  it("closes provider when app.close fails and preserves app error", async () => {
    const appError = new Error("app close failed");
    const app = { close: vi.fn(async () => { throw appError; }) };
    const provider = { close: vi.fn(() => {}) };
    await expect(shutdownApiResources(app, provider)).rejects.toBe(appError);
    expect(provider.close).toHaveBeenCalledTimes(1);
  });

  it("preserves provider close errors", async () => {
    const providerError = new Error("provider close failed");
    await expect(shutdownApiResources({ close: vi.fn(async () => {}) }, { close: vi.fn(() => { throw providerError; }) })).rejects.toBe(providerError);
  });

  it("preserves both close errors", async () => {
    const appError = new Error("app close failed");
    const providerError = new Error("provider close failed");
    await expect(shutdownApiResources(
      { close: vi.fn(async () => { throw appError; }) },
      { close: vi.fn(() => { throw providerError; }) },
    )).rejects.toSatisfy((error: unknown) => error instanceof AggregateError && error.errors.includes(appError) && error.errors.includes(providerError));
  });

  it("deduplicates repeated shutdown calls", async () => {
    const app = { close: vi.fn(async () => {}) };
    const provider = { close: vi.fn(async () => {}) };
    const shutdown = createApiShutdown(app, provider);
    await Promise.all([shutdown(), shutdown(), shutdown()]);
    expect(app.close).toHaveBeenCalledTimes(1);
    expect(provider.close).toHaveBeenCalledTimes(1);
  });
});
