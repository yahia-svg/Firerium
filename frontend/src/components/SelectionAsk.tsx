import { useEffect, useState } from 'react'
import { useApp } from '../ctx'

// Select any text on a page and reply to it: a small toolbar appears above the selection
// and hands the exact passage to the AI side panel.

type Spot = { x: number; y: number; below: boolean; text: string }

const MIN = 3
const MAX = 1200

export default function SelectionAsk() {
  const { openAsk } = useApp()
  const [spot, setSpot] = useState<Spot | null>(null)

  useEffect(() => {
    const read = () => {
      const sel = window.getSelection()
      const text = sel?.toString().replace(/\s+/g, ' ').trim() ?? ''
      if (!sel || sel.isCollapsed || text.length < MIN || sel.rangeCount === 0) return setSpot(null)
      const node = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement
      // only page content: not the side panel, the menu, or a form field
      if (!node || !node.closest('.main') || node.closest('input, textarea, select, .ai-panel, .sel-pop')) return setSpot(null)
      const rect = sel.getRangeAt(0).getBoundingClientRect()
      if (!rect.width && !rect.height) return setSpot(null)
      const below = rect.top < 72
      const x = Math.min(window.innerWidth - 120, Math.max(120, rect.left + rect.width / 2))
      setSpot({ x, y: below ? rect.bottom + 8 : rect.top - 42, below, text: text.slice(0, MAX) })
    }
    const onUp = () => setTimeout(read, 0)
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return setSpot(null)
      if (e.shiftKey) read()
    }
    const hide = () => setSpot(null)
    document.addEventListener('mouseup', onUp)
    document.addEventListener('touchend', onUp)
    document.addEventListener('keyup', onKeyUp)
    window.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)
    return () => {
      document.removeEventListener('mouseup', onUp)
      document.removeEventListener('touchend', onUp)
      document.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('resize', hide)
    }
  }, [])

  if (!spot) return null
  const done = () => {
    window.getSelection()?.removeAllRanges()
    setSpot(null)
  }
  return (
    <div
      className="sel-pop"
      role="toolbar"
      aria-label="Ask the AI about the selected text"
      style={{ left: spot.x, top: spot.y, ['--origin' as string]: spot.below ? '50% 0%' : '50% 100%' }}
      onMouseDown={(e) => e.preventDefault() /* keep the selection while clicking */}
    >
      <button
        onClick={() => {
          openAsk(undefined, spot.text)
          done()
        }}
      >
        ✦ Ask AI
      </button>
      <span className="sep" />
      <button
        onClick={() => {
          openAsk('Explain this passage in clear terms: what it means, which NASA experiment or source it comes from, and how strong the evidence is.', spot.text)
          done()
        }}
      >
        Explain
      </button>
      <span className="sep" />
      <button
        onClick={() => {
          openAsk('Is this supported by NASA’s measurements? Show the evidence, and say whether there is a research gap.', spot.text)
          done()
        }}
      >
        Check evidence
      </button>
    </div>
  )
}
