import { createHash } from "node:crypto";

function canonicalize(value, seen, location) {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(
        `Canonical JSON requires finite numbers at ${location}.`,
      );
    }
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (value === undefined) {
    throw new TypeError(
      `Canonical JSON cannot encode undefined at ${location}.`,
    );
  }
  if (typeof value !== "object") {
    throw new TypeError(
      `Canonical JSON cannot encode ${typeof value} values at ${location}.`,
    );
  }
  if (seen.has(value)) {
    throw new TypeError(`Canonical JSON cannot encode cycles at ${location}.`);
  }
  if (
    Object.getPrototypeOf(value) !== Object.prototype &&
    !Array.isArray(value)
  ) {
    throw new TypeError(
      `Canonical JSON requires plain objects at ${location}.`,
    );
  }

  seen.add(value);
  let encoded;
  if (Array.isArray(value)) {
    encoded = `[${Array.from({ length: value.length }, (_, index) => {
      if (!Object.hasOwn(value, index)) {
        throw new TypeError(
          `Canonical JSON cannot encode sparse/undefined array entries at ${location}[${index}].`,
        );
      }
      return canonicalize(value[index], seen, `${location}[${index}]`);
    }).join(",")}]`;
  } else {
    encoded = `{${Object.keys(value)
      .sort()
      .map((key) => {
        const child = value[key];
        if (child === undefined) {
          throw new TypeError(
            `Canonical JSON cannot encode undefined at ${location}.${key}.`,
          );
        }
        return `${JSON.stringify(key)}:${canonicalize(
          child,
          seen,
          `${location}.${key}`,
        )}`;
      })
      .join(",")}}`;
  }
  seen.delete(value);
  return encoded;
}

export function canonicalJson(value) {
  return canonicalize(value, new Set(), "$");
}

export function hashHandoffPayload(value) {
  return createHash("sha256")
    .update(canonicalJson(value), "utf8")
    .digest("hex");
}
