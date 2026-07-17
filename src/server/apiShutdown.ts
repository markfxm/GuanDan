export type ApiClosable = Readonly<{ close: () => void | Promise<void> }>;

export async function shutdownApiResources(app: ApiClosable, provider: ApiClosable): Promise<void> {
  let appError: unknown;
  let providerError: unknown;

  try {
    await app.close();
  } catch (error) {
    appError = error;
  }

  try {
    await provider.close();
  } catch (error) {
    providerError = error;
  }

  if (appError !== undefined && providerError !== undefined) {
    throw new AggregateError([appError, providerError], "API shutdown failed");
  }
  if (appError !== undefined) throw appError;
  if (providerError !== undefined) throw providerError;
}

export function createApiShutdown(app: ApiClosable, provider: ApiClosable): () => Promise<void> {
  let shutdownPromise: Promise<void> | undefined;
  return () => {
    shutdownPromise ??= shutdownApiResources(app, provider);
    return shutdownPromise;
  };
}
