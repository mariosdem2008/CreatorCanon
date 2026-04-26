import type { ToolDef } from './types';

/** Process-level singleton. Tools register at module import time and never clear in production. */
const REGISTRY = new Map<string, ToolDef<any, any>>();

export function registerTool<I, O>(tool: ToolDef<I, O>): void {
  if (REGISTRY.has(tool.name)) {
    throw new Error(`Tool '${tool.name}' already registered`);
  }
  REGISTRY.set(tool.name, tool);
}

export function getTool(name: string): ToolDef<any, any> | undefined {
  return REGISTRY.get(name);
}

export function listTools(names: string[]): ToolDef<any, any>[] {
  return names.map((n) => {
    const t = REGISTRY.get(n);
    if (!t) throw new Error(`Tool '${n}' not registered`);
    return t;
  });
}

/** Test-only: clear the registry so each test sees a clean state. */
export function _resetRegistryForTests(): void {
  if (process.env.NODE_ENV !== 'test' && !process.env.PIPELINE_TEST_PROVIDER) {
    throw new Error('_resetRegistryForTests called outside test context');
  }
  REGISTRY.clear();
}
