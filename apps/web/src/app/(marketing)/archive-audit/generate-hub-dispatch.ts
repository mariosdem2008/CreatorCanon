export function shouldDispatchAuditRun(result: { queuedForDispatch: boolean }): boolean {
  return result.queuedForDispatch;
}
