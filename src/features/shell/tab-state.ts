/**
 * App shell tab state — pure reducer.
 * The Home tab always exists and cannot be closed. Canvas tabs are identified by workspace id.
 * The Settings tab is a reserved id that opens/closes like a canvas tab.
 */

export const HOME_TAB = 'home'
export const SETTINGS_TAB = 'settings'

export interface TabState {
  /** Open canvas tabs (workspace ids), in order */
  tabs: string[]
  /** Active tab — HOME_TAB or a workspace id */
  active: string
}

export const initialTabs: TabState = { tabs: [], active: HOME_TAB }

export type TabAction =
  | { type: 'tab/open'; id: string }
  | { type: 'tab/close'; id: string }
  | { type: 'tab/activate'; id: string }

export function tabReducer(state: TabState, action: TabAction): TabState {
  switch (action.type) {
    case 'tab/open': {
      // If already open, only change the active tab
      const tabs = state.tabs.includes(action.id) ? state.tabs : [...state.tabs, action.id]
      return { tabs, active: action.id }
    }

    case 'tab/close': {
      const idx = state.tabs.indexOf(action.id)
      if (idx === -1) return state
      const tabs = state.tabs.filter((t) => t !== action.id)
      if (state.active !== action.id) return { tabs, active: state.active }
      // Closing the active tab falls through to the right neighbor → left neighbor → Home
      const next = tabs[idx] ?? tabs[idx - 1] ?? HOME_TAB
      return { tabs, active: next }
    }

    case 'tab/activate':
      return action.id === HOME_TAB || state.tabs.includes(action.id)
        ? { ...state, active: action.id }
        : state
  }
}
