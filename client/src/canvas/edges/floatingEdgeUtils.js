import { Position } from '@xyflow/react';

/**
 * Calculates the intersection point where the line from the center of
 * intersectionNode toward the center of targetNode meets the border
 * of intersectionNode's bounding rectangle.
 *
 * Based on the React Flow official "Floating Edges" example
 * and the Chebyshev-norm formula from math.stackexchange.com/q/1724792.
 */
export function getNodeIntersection(intersectionNode, targetNode) {
  const iw = intersectionNode.measured?.width ?? 180;
  const ih = intersectionNode.measured?.height ?? 60;
  const iPos = intersectionNode.internals?.positionAbsolute ?? intersectionNode.position;
  const tMeasuredW = targetNode.measured?.width ?? 180;
  const tMeasuredH = targetNode.measured?.height ?? 60;
  const tPos = targetNode.internals?.positionAbsolute ?? targetNode.position;

  const w = iw / 2;
  const h = ih / 2;

  const x2 = iPos.x + w;
  const y2 = iPos.y + h;
  const x1 = tPos.x + tMeasuredW / 2;
  const y1 = tPos.y + tMeasuredH / 2;

  const xx1 = (x1 - x2) / (2 * w) - (y1 - y2) / (2 * h);
  const yy1 = (x1 - x2) / (2 * w) + (y1 - y2) / (2 * h);
  const a = 1 / (Math.abs(xx1) + Math.abs(yy1) || 1);
  const xx3 = a * xx1;
  const yy3 = a * yy1;

  return {
    x: w * (xx3 + yy3) + x2,
    y: h * (-xx3 + yy3) + y2,
  };
}

/**
 * Determines which side of the node (Top/Right/Bottom/Left) the
 * intersection point falls on.
 */
export function getEdgePosition(node, intersectionPoint) {
  const nw = node.measured?.width ?? 180;
  const nh = node.measured?.height ?? 60;
  const nPos = node.internals?.positionAbsolute ?? node.position;
  const nx = Math.round(nPos.x);
  const ny = Math.round(nPos.y);
  const px = Math.round(intersectionPoint.x);
  const py = Math.round(intersectionPoint.y);

  if (px <= nx + 1) return Position.Left;
  if (px >= nx + nw - 1) return Position.Right;
  if (py <= ny + 1) return Position.Top;
  return Position.Bottom;
}

/**
 * Returns all parameters needed to render a floating edge between
 * sourceNode and targetNode using getBezierPath.
 *
 * Both nodes must be InternalNode objects (from useInternalNode or
 * getInternalNode) so that .internals.positionAbsolute and .measured
 * are available.
 */
export function getFloatingEdgeParams(sourceNode, targetNode) {
  const sourceIntersection = getNodeIntersection(sourceNode, targetNode);
  const targetIntersection = getNodeIntersection(targetNode, sourceNode);

  const sourcePos = getEdgePosition(sourceNode, sourceIntersection);
  const targetPos = getEdgePosition(targetNode, targetIntersection);

  return {
    sx: sourceIntersection.x,
    sy: sourceIntersection.y,
    tx: targetIntersection.x,
    ty: targetIntersection.y,
    sourcePos,
    targetPos,
  };
}
