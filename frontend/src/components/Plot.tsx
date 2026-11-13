import { useEffect, useRef, useState } from 'react'
import type { Config, Data, Layout } from 'plotly.js-dist-min'
import { useApp, type Theme } from '../ctx'

// Plotly is large, so it is loaded only when a chart is first shown.
type PlotlyApi = (typeof import('plotly.js-dist-min'))['default']
let plotly: Promise<PlotlyApi> | null = null
const loadPlotly = () => (plotly ??= import('plotly.js-dist-min').then((m) => m.default))

/** Validated categorical order (see the dataviz reference palette): fixed order, never cycled. Light steps. */
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948']
/** The same eight hues stepped for the dark surface (selected, not inverted). */
const SERIES_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767']
export const INK = '#0b0b0b'
export const MUTED = '#898781'

// Charts are written once, in light colours. In dark mode every light value is swapped for its
// dark step here, so pages never need to know the theme.
const DARK_SWAP: [string, string][] = [
  ...SERIES.map((c, i) => [c, SERIES_DARK[i]] as [string, string]),
  [INK, '#f0efec'], ['#fcfcfb', '#1a1a19'], ['#c3c2b7', '#383835'], ['#e1e0d9', '#2c2c2a'],
  ['rgba(11,11,11,', 'rgba(240,239,236,'],
]
function forTheme<T>(value: T, theme: Theme): T {
  if (theme === 'light') return value
  let s = JSON.stringify(value)
  for (const [a, b] of DARK_SWAP) s = s.split(a).join(b)
  return JSON.parse(s) as T
}

const base = (theme: Theme): Partial<Layout> => {
  const dark = theme === 'dark'
  return {
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: dark ? '#1a1a19' : '#fcfcfb',
    font: { color: dark ? '#c3c2b7' : '#52514e', family: 'Inter, Segoe UI, system-ui, sans-serif', size: 12.5 },
    margin: { l: 68, r: 20, t: 16, b: 58 },
    legend: { orientation: 'h', y: -0.2, font: { size: 12, color: dark ? '#f0efec' : '#0b0b0b' } },
    hoverlabel: dark
      ? { bgcolor: '#f0efec', bordercolor: '#f0efec', font: { color: '#0e0e0d', size: 12 } }
      : { bgcolor: '#0b0b0b', bordercolor: '#0b0b0b', font: { color: '#ffffff', size: 12 } },
    colorway: dark ? SERIES_DARK : SERIES,
  }
}
const axis = (theme: Theme) =>
  theme === 'dark'
    ? { gridcolor: '#2c2c2a', zerolinecolor: '#383835', linecolor: '#383835', automargin: true, tickfont: { color: '#898781' } }
    : { gridcolor: '#e1e0d9', zerolinecolor: '#c3c2b7', linecolor: '#c3c2b7', automargin: true, tickfont: { color: '#898781' } }

export default function Plot({ data, layout, height = 480, name = 'flame-in-freefall-chart' }: {
  data: Data[]
  layout: Partial<Layout>
  height?: number
  name?: string
}) {
  const { theme } = useApp()
  const ref = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let dead = false
    const el = ref.current
    loadPlotly()
      .then((P) => {
        if (dead || !el) return
        const lay = forTheme(layout, theme)
        const merged: Partial<Layout> = {
          ...base(theme), ...lay, height,
          xaxis: { ...axis(theme), ...lay.xaxis },
          yaxis: { ...axis(theme), ...lay.yaxis },
        }
        const config: Partial<Config> = {
          responsive: true, displaylogo: false,
          modeBarButtonsToRemove: ['lasso2d', 'select2d', 'autoScale2d'],
          toImageButtonOptions: { format: 'png', filename: name, scale: 2 },
        }
        void P.react(el, forTheme(data, theme), merged, config)
      })
      .catch(() => !dead && setError('The chart library could not be loaded.'))
    return () => {
      dead = true
    }
  }, [data, layout, height, name, theme])

  useEffect(() => {
    const el = ref.current
    return () => {
      if (el) void loadPlotly().then((P) => P.purge(el))
    }
  }, [])

  if (error) return <div className="banner bad">{error}</div>
  return <div ref={ref} className="plot" style={{ minHeight: height }} />
}
