/**
 * useUndoableReducer Hook
 *
 * Wraps a React reducer with an undo/redo history stack.
 * Snapshot-based: stores full state snapshots for simplicity and reliability.
 */

import { useReducer, useCallback, useMemo } from 'react'

const MAX_HISTORY = 50

/** Actions that should NOT be recorded in undo history (selection, drag, toggles, etc.) */
const NON_UNDOABLE_ACTIONS = new Set([
  'SELECT_NODE',
  'SELECT_NODES',
  'COPY_NODES',
  'SET_NODE_POSITION',
  'TOGGLE_BYPASS',
  'TOGGLE_MUTE',
])

interface UndoState<S> {
  past: S[]
  present: S
  future: S[]
}

type UndoAction<A> = { type: '__UNDO__' } | { type: '__REDO__' } | A

function createUndoReducer<S, A extends { type: string }>(
  innerReducer: (state: S, action: A) => S
) {
  return function undoReducer(state: UndoState<S>, action: UndoAction<A>): UndoState<S> {
    if (action.type === '__UNDO__') {
      if (state.past.length === 0) return state
      const previous = state.past[state.past.length - 1]
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
      }
    }

    if (action.type === '__REDO__') {
      if (state.future.length === 0) return state
      const next = state.future[0]
      return {
        past: [...state.past, state.present],
        present: next,
        future: state.future.slice(1),
      }
    }

    const newPresent = innerReducer(state.present, action as A)
    if (newPresent === state.present) return state

    // Don't record non-undoable actions (like selection changes) in history
    if (NON_UNDOABLE_ACTIONS.has((action as A).type)) {
      return { ...state, present: newPresent }
    }

    const newPast = [...state.past, state.present].slice(-MAX_HISTORY)
    return {
      past: newPast,
      present: newPresent,
      future: [], // Clear redo stack on new action
    }
  }
}

export function useUndoableReducer<S, A extends { type: string }>(
  reducer: (state: S, action: A) => S,
  initialArg: unknown,
  initializer: (arg: unknown) => S
) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const undoReducer = useMemo(() => createUndoReducer(reducer), [])

  const [undoState, undoDispatch] = useReducer(undoReducer, initialArg, (arg) => ({
    past: [],
    present: initializer(arg),
    future: [],
  }))

  const dispatch = useCallback((action: A) => undoDispatch(action), [undoDispatch])

  const undo = useCallback(() => undoDispatch({ type: '__UNDO__' }), [undoDispatch])
  const redo = useCallback(() => undoDispatch({ type: '__REDO__' }), [undoDispatch])

  return {
    state: undoState.present,
    dispatch,
    undo,
    redo,
    canUndo: undoState.past.length > 0,
    canRedo: undoState.future.length > 0,
  }
}
