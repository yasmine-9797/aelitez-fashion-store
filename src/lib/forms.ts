import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { isApiError } from "./api";

/** Puts API field errors (e.g. "address.pincode") onto the matching form fields; returns the general message. */
export function applyApiErrors<T extends FieldValues>(err: unknown, setError: UseFormSetError<T>, prefix = ""): string {
  if (!isApiError(err)) return "Something went wrong. Please try again.";
  for (const [key, messages] of Object.entries(err.details ?? {})) {
    const field = prefix && key.startsWith(prefix) ? key.slice(prefix.length) : key;
    if (messages[0]) setError(field as Path<T>, { type: "server", message: messages[0] });
  }
  return err.message;
}
