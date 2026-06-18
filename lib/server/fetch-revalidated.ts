export const REVALIDATE_SECONDS = 60;

export async function fetchRevalidatedJson(url: string): Promise<unknown> {
  const response = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS } });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Fetch failed (${response.status}): ${errorText}`);
  }

  return response.json();
}
