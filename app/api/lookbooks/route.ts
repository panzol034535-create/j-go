export async function GET() {
  const url = process.env.XANO_LOOKBOOKS_URL;

  if (!url) {
    return Response.json(
      { success: false, message: "Missing XANO_LOOKBOOKS_URL" },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(`${url}?t=${Date.now()}`, { cache: "no-store" });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`讀取 Lookbook 失敗：${response.status} ${text}`);
    }

    const data = await response.json();

    return Response.json({
      success: true,
      items: data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "讀取 Lookbook 失敗";

    return Response.json({
      success: false,
      items: [],
      message,
    });
  }
}
