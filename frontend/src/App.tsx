import { lazy, Suspense } from 'react'
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'
import { Loading } from './components/bits'
import Shell from './components/Shell'
import { AppProvider } from './ctx'
import Assistant from './pages/Assistant'
import Compare from './pages/Compare'
import Explorer from './pages/Explorer'
import Home from './pages/Home'
import Gaps from './pages/Gaps'
import Insights from './pages/Insights'
import InvestigationPage from './pages/InvestigationPage'
import Lessons from './pages/Lessons'
import Mission from './pages/Mission'
import Ranking from './pages/Ranking'
import Resources from './pages/Resources'

const Charts = lazy(() => import('./pages/Charts'))
const Predict = lazy(() => import('./pages/Predict'))

function NotFound() {
  return (
    <div className="page stack">
      <h1>Page not found</h1>
      <p className="muted">
        That address does not exist. <Link to="/">Go to the start page</Link>.
      </p>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <Shell>
          <Suspense fallback={<div className="page"><Loading /></div>}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/explorer" element={<Explorer />} />
              <Route path="/explorer/:id" element={<InvestigationPage />} />
              <Route path="/assistant" element={<Assistant />} />
              <Route path="/ranking" element={<Ranking />} />
              <Route path="/compare" element={<Compare />} />
              <Route path="/insights" element={<Insights />} />
              <Route path="/lessons" element={<Lessons />} />
              <Route path="/charts" element={<Charts />} />
              <Route path="/gaps" element={<Gaps />} />
              <Route path="/whatif" element={<Predict />} />
              <Route path="/mission" element={<Mission />} />
              <Route path="/resources" element={<Resources />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </Shell>
      </AppProvider>
    </BrowserRouter>
  )
}
