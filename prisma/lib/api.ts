// Small fetch helper for the editor forms: JSON in, JSON out, and a real
// Error (with the server's message) when the request fails.
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// Message to show when saving failed: a permission problem reads differently from a glitch.
export function saveError(e: unknown, tr: (s: string) => string): string {
  const status = (e as ApiError)?.status;
  return status === 401 || status === 403
    ? tr("You don't have permission to do this.")
    : tr("Could not save. Please try again.");
}

export async function api<T = any>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((data as any).error ?? "request failed", res.status);
  return data as T;
}

// "2026-10-08" for <input type="date"> from an ISO string, in LOCAL time.
export function toDateInput(iso?: string | Date | null): string {
  const d = iso ? new Date(iso) : new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// date input -> ISO at local noon (avoids timezone day-shift bugs)
export function fromDateInput(v: string): string {
  return new Date(`${v}T12:00:00`).toISOString();
}
