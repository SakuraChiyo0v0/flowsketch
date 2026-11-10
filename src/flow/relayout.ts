import { useStore } from '../store'
import { autoLayout } from './autoLayout'

/** Re-run auto layout for the whole graph (one undoable step). */
export async function relayout() {
  const st = useStore.getState()
  const pos = await autoLayout(st.project())
  st.update((p) => ({ ...p, positions: pos }))
}
