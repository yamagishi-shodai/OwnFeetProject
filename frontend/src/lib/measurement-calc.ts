import type { Point } from "@/types";

export function calcPixelDistance(a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function pixelsToCm(pixels: number, pixelsPerCm: number): number {
  return pixels / pixelsPerCm;
}

export function calcDistanceCm(a: Point, b: Point, pixelsPerCm: number): number {
  return pixelsToCm(calcPixelDistance(a, b), pixelsPerCm);
}
