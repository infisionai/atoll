/** Agent profiles — launch commands and MCP registration are owned by Rust (terminal.rs).
 *  The frontend only knows the choices and their labels */
export type AgentId = 'claude' | 'codex'

export const AGENT_PROFILES: Array<{ id: AgentId; label: string }> = [
  { id: 'claude', label: 'Claude Code' },
  { id: 'codex', label: 'Codex' },
]
