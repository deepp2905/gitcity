import * as THREE from "three";
import { CELL_SIZE } from "./layout";

/**
 * A unit box whose four vertical edges are rounded.
 *
 * Only the vertical edges are filleted, deliberately. Instances are
 * scaled on Y to their contribution height, so any rounding on the top
 * or bottom faces would stretch with the building — a tall tower would
 * get a long smeared fillet while a short one stayed crisp. Rounding
 * just the vertical edges is invariant under Y scaling, so every
 * building keeps an identical corner radius no matter its height.
 *
 * It also gives the flat, top-down view soft rounded squares, matching
 * the rounded cells of the 2D heatmap.
 */

/** Fraction of the tile width taken by the corner radius. */
const CORNER_RADIUS_RATIO = 0.18;

/** Segments per corner. Four is plenty at this scale and keeps the
 * vertex count low across ~370 instances. */
const CORNER_SEGMENTS = 4;

function roundedSquareShape(size: number, radius: number): THREE.Shape {
  const half = size / 2;
  const r = Math.min(radius, half);
  const shape = new THREE.Shape();

  shape.moveTo(-half + r, -half);
  shape.lineTo(half - r, -half);
  shape.quadraticCurveTo(half, -half, half, -half + r);
  shape.lineTo(half, half - r);
  shape.quadraticCurveTo(half, half, half - r, half);
  shape.lineTo(-half + r, half);
  shape.quadraticCurveTo(-half, half, -half, half - r);
  shape.lineTo(-half, -half + r);
  shape.quadraticCurveTo(-half, -half, -half + r, -half);

  return shape;
}

/**
 * Builds the shared instance geometry: a rounded square extruded to unit
 * height, sitting on the origin so scaling Y grows it upward from its
 * own centre exactly as a BoxGeometry would.
 */
export function createBuildingGeometry(): THREE.ExtrudeGeometry {
  const shape = roundedSquareShape(
    CELL_SIZE,
    CELL_SIZE * CORNER_RADIUS_RATIO,
  );

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 1,
    bevelEnabled: false,
    curveSegments: CORNER_SEGMENTS,
  });

  // Extrude runs along +Z from z=0, so after rotating it into place the
  // box occupies y 0..1. Shift down by half to centre it on the origin,
  // matching BoxGeometry: instances are scaled by their height and
  // positioned at height/2, which only lands on the ground if the
  // geometry is centred. Translating the wrong way floats every building
  // by its own height.
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -0.5, 0);
  geometry.computeVertexNormals();

  return geometry;
}
