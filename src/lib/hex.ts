import { useId, useMemo } from 'react';
import type { BoardSize } from '../../shared/engine';

export interface HexGeometry {
  size: BoardSize;
  radius: number;
  viewBox: string;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  centers: { x: number; y: number }[];
  polygons: string[];
}

const SQRT3 = Math.sqrt(3);

export function buildHexGeometry(
  size: BoardSize,
  radius = 40,
  padding = 12,
): HexGeometry {
  const innerWidth = SQRT3 * radius * (1.5 * size - 0.5);
  const innerHeight = 1.5 * size * radius + 0.5 * radius;
  const width = innerWidth + padding * 2;
  const height = innerHeight + padding * 2;
  const offsetX = padding + (SQRT3 * radius) / 2;
  const offsetY = padding + radius;
  const centers: { x: number; y: number }[] = [];
  const polygons: string[] = [];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const cx = offsetX + SQRT3 * radius * (x + y / 2);
      const cy = offsetY + 1.5 * radius * y;
      centers.push({ x: cx, y: cy });
      const points: string[] = [];
      for (let vertex = 0; vertex < 6; vertex += 1) {
        const angle = (Math.PI / 180) * (60 * vertex - 30);
        points.push(
          `${(cx + radius * Math.cos(angle)).toFixed(3)},${(cy + radius * Math.sin(angle)).toFixed(3)}`,
        );
      }
      polygons.push(points.join(' '));
    }
  }

  return {
    size,
    radius,
    viewBox: `0 0 ${width.toFixed(2)} ${height.toFixed(2)}`,
    width,
    height,
    centerX: width / 2,
    centerY: height / 2,
    centers,
    polygons,
  };
}

export function useHexGeometry(size: BoardSize, radius = 40, padding = 12) {
  return useMemo(() => buildHexGeometry(size, radius, padding), [size, radius, padding]);
}

export function useGradientId(prefix: string): string {
  const id = useId().replace(/[:]/g, '');
  return `${prefix}-${id}`;
}

export const GATE_DIRECTIONS = [
  { side: 1, label: 'TOP', axis: 'y' as const, edge: 0 },
  { side: 1, label: 'BOTTOM', axis: 'y' as const, edge: 1 },
  { side: 2, label: 'LEFT', axis: 'x' as const, edge: 0 },
  { side: 2, label: 'RIGHT', axis: 'x' as const, edge: 1 },
];
