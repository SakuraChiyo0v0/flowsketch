import type { Project, Screen } from '../model/types'
import { DEVICE_SIZE, DEVICES } from '../model/types'
import { measure } from './layout'

/** Frame size of a screen state: pages use the device size; overlays shrink to content. */
export function frameSize(p: Project, s: Screen, stateId: string): { w: number; h: number } {
  const dev = DEVICE_SIZE[p.device]
  if (s.kind !== 'overlay') {
    const st = s.states.find((x) => x.id === stateId) ?? s.states[0]
    // let long pages scroll: frame grows to content
    return { w: dev.w, h: Math.max(dev.h, st ? Math.ceil(measure(st.root, dev.w)) : dev.h) }
  }
  const st = s.states.find((x) => x.id === stateId) ?? s.states[0]
  const t = s.overlayType ?? 'modal'
  const w = t === 'modal' ? DEVICES[p.device].modalW : t === 'drawer' ? DEVICES[p.device].drawerW : t === 'toast' ? 280 : p.device === 'mobile' ? dev.w : Math.min(dev.w, 640)
  const contentH = st ? Math.ceil(measure(st.root, w)) : 200
  const h = t === 'drawer' ? dev.h : t === 'toast' ? Math.max(48, contentH) : Math.max(120, Math.min(dev.h - 80, contentH))
  return { w, h }
}

export const OVERLAY_LABEL: Record<string, string> = { modal: '弹窗', sheet: '底部抽屉', drawer: '侧边抽屉', toast: '轻提示' }
