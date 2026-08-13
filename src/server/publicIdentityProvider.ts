import type { CanonicalRoomRequestDescriptor } from "./publicIdentityDescriptor";
import { PublicIdentityStore, type PublicIdentityAllocation } from "./publicIdentityStore";

export type PublicIdentityProviderInput = Readonly<{
  descriptor: CanonicalRoomRequestDescriptor;
  idempotencyKey: string;
}>;

export type PublicIdentityProvider = Readonly<{
  allocate(input: PublicIdentityProviderInput): PublicIdentityAllocation;
  markRoomCommitted(idempotencyKey: string): PublicIdentityAllocation;
  markAllocated(idempotencyKey: string): never;
  close(): void;
}>;

export function createPublicIdentityProvider(store: PublicIdentityStore): PublicIdentityProvider {
  return Object.freeze({
    allocate: (input: PublicIdentityProviderInput) => {
      if ("sessionIdentity" in (input as Record<string, unknown>) || "gameSequence" in (input as Record<string, unknown>)) throw new Error("IDENTITY_INPUT_FORBIDDEN");
      return store.allocate(input.descriptor, input.idempotencyKey);
    },
    markRoomCommitted: (idempotencyKey: string) => store.markRoomCommitted(idempotencyKey),
    markAllocated: (idempotencyKey: string) => store.markAllocated(idempotencyKey),
    close: () => store.close(),
  });
}
