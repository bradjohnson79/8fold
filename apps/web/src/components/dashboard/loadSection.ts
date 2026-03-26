"use client";

export type SectionResult<T> = {
  data: T | null;
  failed: boolean;
};

export async function readJsonResponse<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new Error(
      error instanceof Error ? `Invalid JSON response: ${error.message}` : "Invalid JSON response",
    );
  }
}

export async function loadSection<T>(
  fn: () => Promise<T>,
  options?: { section?: string; route?: string },
): Promise<SectionResult<T>> {
  try {
    const data = await fn();
    return { data, failed: false };
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[dashboard] section load failed", {
        section: options?.section ?? "unknown",
        route: options?.route ?? "unknown",
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return { data: null, failed: true };
  }
}
