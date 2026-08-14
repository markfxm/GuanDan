export function isPlainDataRecord(value: unknown, allowedKeys?: readonly string[], exact = false): value is Record<string, unknown> {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    const ownKeys = Reflect.ownKeys(value);
    const allowed = allowedKeys === undefined ? undefined : new Set(allowedKeys);
    if (allowed !== undefined) {
      if (allowedKeys === undefined || allowed.size !== allowedKeys.length) return false;
    }
    if (ownKeys.some((key) => typeof key !== "string" || (allowed !== undefined && !allowed.has(key)))) return false;
    if (exact && allowed !== undefined && allowedKeys !== undefined && (ownKeys.length !== allowed.size || allowedKeys.some((key) => !ownKeys.includes(key)))) return false;
    return ownKeys.every((key) => isDataDescriptor(Object.getOwnPropertyDescriptor(value, key)));
  } catch {
    return false;
  }
}

export function isPlainDataArray(value: unknown): value is readonly unknown[] {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return false;
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    if (!isDataDescriptor(lengthDescriptor) || !isNonNegativeSafeInteger(lengthDescriptor.value)) return false;
    const length = lengthDescriptor.value;
    const ownKeys = Reflect.ownKeys(value);
    const ownKeySet = new Set(ownKeys);
    if (ownKeys.length !== length + 1 || !ownKeySet.has("length")) return false;
    for (let index = 0; index < length; index += 1) {
      const key = String(index);
      if (!ownKeySet.has(key) || !isDataDescriptor(Object.getOwnPropertyDescriptor(value, key))) return false;
    }
    return ownKeys.every((key) => key === "length" || (typeof key === "string" && /^(?:0|[1-9]\d*)$/.test(key) && Number(key) < length));
  } catch {
    return false;
  }
}

export function isDataDescriptor(descriptor: PropertyDescriptor | undefined): descriptor is PropertyDescriptor & { value: unknown } {
  return descriptor !== undefined
    && Object.prototype.hasOwnProperty.call(descriptor, "value")
    && descriptor.get === undefined
    && descriptor.set === undefined;
}

export function getOwnDataProperty(value: unknown, key: string): unknown {
  if (value === null || typeof value !== "object") throw new TypeError("DATA_PROPERTY_INVALID");
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!isDataDescriptor(descriptor)) throw new TypeError("DATA_PROPERTY_INVALID");
  return descriptor.value;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
}
