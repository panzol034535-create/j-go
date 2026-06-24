export function deferClientUpdate(task: () => void): void {
  queueMicrotask(task);
}
