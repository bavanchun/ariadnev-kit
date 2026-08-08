export type GraphFindingSeverity = "error" | "warning" | "unsupported";

export interface GraphFinding {
  id: string;
  severity: GraphFindingSeverity;
  graphId: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
  path?: string[];
}

export function finding(
  graphId: string,
  id: string,
  message: string,
  details: Omit<GraphFinding, "graphId" | "id" | "message" | "severity"> & {
    severity?: GraphFindingSeverity;
  } = {},
): GraphFinding {
  return { graphId, id, message, severity: details.severity ?? "error", ...details };
}

export function sortFindings(findings: GraphFinding[]): GraphFinding[] {
  return [...findings].sort((left, right) => {
    const leftKey = [left.id, left.nodeId ?? "", left.edgeId ?? "", (left.path ?? []).join("/")].join("\0");
    const rightKey = [right.id, right.nodeId ?? "", right.edgeId ?? "", (right.path ?? []).join("/")].join("\0");
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
}
