declare module 'graphlib' {
  export class Graph {
    constructor(options?: { directed?: boolean })
    setNode(id: string, value?: unknown): void
    setEdge(from: string, to: string, value?: unknown): void
    outEdges(id: string): Array<{ v: string; w: string }> | undefined
    inEdges(id: string): Array<{ v: string; w: string }> | undefined
    edge(edge: { v: string; w: string }): unknown
  }
}

declare module 'json-logic-js' {
  const jsonLogic: {
    apply: (logic: unknown, data?: unknown) => unknown
  }
  export default jsonLogic
}
