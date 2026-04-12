export function sameStructuredTurnId(leftTurnId, rightTurnId) {
  const normalizedLeft = leftTurnId ?? null;
  const normalizedRight = rightTurnId ?? null;
  if (normalizedLeft || normalizedRight) {
    return normalizedLeft === normalizedRight;
  }
  return true;
}
