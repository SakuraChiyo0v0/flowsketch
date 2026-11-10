import { Component, type ReactNode } from 'react'
import { useStore } from './store'

interface Props {
  children: ReactNode
  /** compact = inline box inside a panel; otherwise full-screen */
  compact?: boolean
  name?: string
}

/** Keeps a render error in one panel from blanking the whole app. Work is auto-saved, so undo/reload is safe. */
export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error(`[${this.props.name ?? 'app'}]`, error)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const retry = () => this.setState({ error: null })
    const undo = () => {
      useStore.getState().undo()
      retry()
    }
    return (
      <div className={this.props.compact ? 'err-box' : 'err-full'}>
        <div className="err-title">{this.props.name ? `「${this.props.name}」` : ''}显示出错了</div>
        <div className="err-msg">{error.message}</div>
        <div className="err-actions">
          <button className="btn sm" onClick={undo}>撤销上一步</button>
          <button className="btn ghost sm" onClick={retry}>重试</button>
          <button className="btn ghost sm" onClick={() => location.reload()}>刷新页面</button>
        </div>
        <div className="err-hint">项目已自动保存，刷新不会丢数据。</div>
      </div>
    )
  }
}
