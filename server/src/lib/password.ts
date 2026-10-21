import { hash, verify } from "@node-rs/argon2";

// Argon2id with OWASP-recommended parameters (19 MiB memory, 2 iterations, 1 lane).
// `algorithm: 2` is Algorithm.Argon2id — the library declares it as an ambient const enum.
const OPTIONS = { algorithm: 2, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (password: string): Promise<string> => hash(password, OPTIONS);

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/** A real hash to verify against when the account does not exist, so response timing does not reveal it. */
let dummyHash: Promise<string> | undefined;
export const getDummyHash = (): Promise<string> => (dummyHash ??= hashPassword("timing-equaliser-not-a-real-password"));
