export interface D1FileOps { write(file: string, value: string): Promise<void> | void; rename(from: string, to: string): Promise<void> | void; remove(file: string): Promise<void> | void; flush?: (file: string) => Promise<void> | void; }
export class AtomicD1Writer {
  public constructor(private readonly ops: D1FileOps, private readonly validate?: (json: string) => void) {}
  public async writeBatch(batchPath: string, batchJson: string, manifestPath: string, manifestJson: string): Promise<void> {
    const batchTemp = `${batchPath}.tmp`; const manifestTemp = `${manifestPath}.tmp`;
    try { this.validate?.(batchJson); this.validate?.(manifestJson); await this.ops.write(batchTemp, batchJson); await this.ops.flush?.(batchTemp); await this.ops.rename(batchTemp, batchPath); await this.ops.write(manifestTemp, manifestJson); await this.ops.flush?.(manifestTemp); await this.ops.rename(manifestTemp, manifestPath); }
    catch (error) { await Promise.allSettled([this.ops.remove(batchTemp), this.ops.remove(manifestTemp)]); throw error; }
  }
}

export function createNodeD1Writer(): AtomicD1Writer {
  return new AtomicD1Writer({
    write: async (file, value) => { const fs = await import("node:fs/promises"); await fs.writeFile(file, value, "utf8"); },
    rename: async (from, to) => { const fs = await import("node:fs/promises"); await fs.rename(from, to); },
    remove: async (file) => { const fs = await import("node:fs/promises"); await fs.rm(file, { force: true }); },
    flush: async () => {},
  }, (json) => { JSON.parse(json); });
}
