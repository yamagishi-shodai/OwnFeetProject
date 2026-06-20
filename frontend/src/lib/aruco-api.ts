const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "";

export type NormalizedCorner = { id: number; x: number; y: number };
export type DetectionResult = { pixelsPerCm: number; corners: NormalizedCorner[] };

export async function detectAruco(
  file: File,
  matWidthCm: number,
  matHeightCm: number,
): Promise<DetectionResult | null> {
  if (!BACKEND) return null;
  const form = new FormData();
  form.append("file", file);
  form.append("mat_width_cm", String(matWidthCm));
  form.append("mat_height_cm", String(matHeightCm));
  try {
    const res = await fetch(`${BACKEND}/api/v1/detect-aruco`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn("[aruco] detection failed", res.status, body);
      return null;
    }
    const data = await res.json();
    console.info("[aruco] detected", data);
    if (typeof data.pixels_per_cm !== "number") return null;
    return {
      pixelsPerCm: data.pixels_per_cm,
      corners: (data.corners_normalized ?? []) as NormalizedCorner[],
    };
  } catch (e) {
    console.warn("[aruco] fetch error", e);
    return null;
  }
}
