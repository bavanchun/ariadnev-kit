// The MCP initialize handshake, spoken over stdio.
//
// This is what makes `mcp verify` more than a file check: a server entry can be
// perfectly well-formed and still name a binary that is gone, crashes on start,
// or speaks something other than MCP. The only way to tell is to start it and
// see whether it answers.
//
// Framing is newline-delimited JSON-RPC, which is what stdio MCP servers use.
// The parse is deliberately tolerant of leading noise: servers commonly print a
// banner before their first message, and treating that as a protocol failure
// would report a working server as broken.

export const PROTOCOL_VERSION = "2025-06-18";

export interface HandshakeRequest {
  jsonrpc: "2.0";
  id: number;
  method: "initialize";
  params: {
    protocolVersion: string;
    capabilities: Record<string, unknown>;
    clientInfo: { name: string; version: string };
  };
}

export interface HandshakeOutcome {
  ok: boolean;
  /** Server name from `serverInfo`, when it answered with one. */
  serverName?: string;
  serverVersion?: string;
  protocolVersion?: string;
  /** Why it failed, in a sentence a user can act on. */
  reason?: string;
}

export function initializeRequest(id = 1, version = "0.0.0"): HandshakeRequest {
  return {
    jsonrpc: "2.0",
    id,
    method: "initialize",
    params: {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "ariadnev", version },
    },
  };
}

export function encodeRequest(request: HandshakeRequest): string {
  return `${JSON.stringify(request)}\n`;
}

/**
 * Read the initialize response out of whatever the server wrote to stdout.
 *
 * @param stdout Everything received before the read ended.
 * @param id The id sent, so another message cannot be mistaken for the answer.
 */
export function readHandshake(stdout: string, id = 1): HandshakeOutcome {
  const lines = stdout.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length === 0) return { ok: false, reason: "the server produced no output" };

  for (const line of lines) {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue; // a banner line, not a message
    }
    if (message.id !== id) continue;
    if (message.error) {
      const error = message.error as { message?: string; code?: number };
      return { ok: false, reason: `the server refused to initialize: ${error.message ?? `code ${error.code}`}` };
    }
    const result = message.result as
      | { protocolVersion?: string; serverInfo?: { name?: string; version?: string } }
      | undefined;
    if (!result) return { ok: false, reason: "the server answered without a result" };
    return {
      ok: true,
      serverName: result.serverInfo?.name,
      serverVersion: result.serverInfo?.version,
      protocolVersion: result.protocolVersion,
    };
  }
  return { ok: false, reason: "the server never answered the initialize request" };
}
