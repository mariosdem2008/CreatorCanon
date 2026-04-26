import type { ToolDef } from './types';

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

// For tests: clear & re-register so each test has a clean registry.
export function _resetRegistryForTests(): void {
  REGISTRY.clear();
}
