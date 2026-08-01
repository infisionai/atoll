import { useEffect, useMemo, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '../../ipc/commands'
import type { AgentId } from './agent-profiles'
import type { TerminalStatus } from './TerminalPanel'

/** Per-workspace agent terminal session — wiring to the PTY bridge (Rust) */
export interface TerminalSession {
  status: TerminalStatus
  /** Current / last-started agent */
  agent: AgentId
  start: (agent?: AgentId, cols?: number, rows?: number) => void
  write: (data: string) => void
  resize: (cols: number, rows: number) => void
  restart: () => void
  /** Stop the session — kills the agent process (only for switching agents) */
  stop: () => void
  /** Subscribe to PTY output (base64-decoded bytes) */
  subscribe: (cb: (data: Uint8Array) => void) => () => void
}

function decode(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

export function useTerminalSession(workspaceId: string): TerminalSession {
  const [status, setStatus] = useState<TerminalStatus>('exited')
  const [agent, setAgent] = useState<AgentId>('claude')
  const agentRef = useRef<AgentId>('claude')
  const listeners = useRef(new Set<(d: Uint8Array) => void>())
  const pendingRestart = useRef(false)
  const sizeRef = useRef({ cols: 80, rows: 24 })
  const statusRef = useRef(status)
  statusRef.current = status

  // Tauri event subscription — kept per workspace, independent of session lifetime
  useEffect(() => {
    if (!isTauri()) return
    let disposed = false
    const offs: Array<() => void> = []
    void import('@tauri-apps/api/event').then(({ listen }) => {
      void listen<{ workspaceId: string; data: string }>('terminal/output', (e) => {
        if (e.payload.workspaceId !== workspaceId) return
        const bytes = decode(e.payload.data)
        for (const cb of listeners.current) cb(bytes)
      }).then((un) => (disposed ? un() : offs.push(un)))
      void listen<{ workspaceId: string }>('terminal/exit', (e) => {
        if (e.payload.workspaceId !== workspaceId) return
        if (pendingRestart.current) {
          pendingRestart.current = false
          void startTauri()
        } else {
          setStatus('exited')
        }
      }).then((un) => (disposed ? un() : offs.push(un)))
    })
    return () => {
      disposed = true
      offs.forEach((un) => un())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  const startTauri = async () => {
    setStatus('starting')
    try {
      await invoke('terminal_start', {
        workspaceId,
        agent: agentRef.current,
        cols: sizeRef.current.cols,
        rows: sizeRef.current.rows,
      })
      setStatus('running')
    } catch (e) {
      console.error('Failed to start terminal:', e)
      setStatus('exited')
    }
  }

  return useMemo<TerminalSession>(() => {
    if (!isTauri()) return browserEchoSession(listeners.current, setStatus)
    return {
      status,
      agent,
      start: (nextAgent, cols, rows) => {
        if (nextAgent) {
          agentRef.current = nextAgent
          setAgent(nextAgent)
        }
        if (cols && rows) sizeRef.current = { cols, rows }
        if (statusRef.current === 'exited') void startTauri()
      },
      write: (data) => void invoke('terminal_write', { workspaceId, data }).catch(() => {}),
      resize: (cols, rows) => {
        sizeRef.current = { cols, rows }
        void invoke('terminal_resize', { workspaceId, cols, rows }).catch(() => {})
      },
      restart: () => {
        if (statusRef.current === 'exited') {
          void startTauri()
        } else {
          pendingRestart.current = true
          void invoke('terminal_kill', { workspaceId }).catch(() => {})
        }
      },
      stop: () => void invoke('terminal_kill', { workspaceId }).catch(() => {}),
      subscribe: (cb) => {
        listeners.current.add(cb)
        return () => listeners.current.delete(cb)
      },
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, status, agent])
}

/** Browser dev — reproduces the flow with a local echo, no PTY */
function browserEchoSession(
  listeners: Set<(d: Uint8Array) => void>,
  setStatus: (s: TerminalStatus) => void,
): TerminalSession {
  const enc = new TextEncoder()
  const emit = (s: string) => {
    for (const cb of listeners) cb(enc.encode(s))
  }
  return {
    status: 'running',
    agent: 'claude',
    start: () => {
      setStatus('running')
      setTimeout(() => emit('\x1b[38;2;47;201;190mAtoll dev terminal\x1b[0m — the PTY connects in the Tauri app\r\n$ '), 50)
    },
    write: (d) => {
      if (d === '\r') emit('\r\n$ ')
      else if (d === '\x7f') emit('\b \b')
      else emit(d)
    },
    resize: () => {},
    restart: () => {},
    stop: () => setStatus('exited'),
    subscribe: (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
  }
}
