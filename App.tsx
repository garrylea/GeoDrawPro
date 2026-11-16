import { useEffect, useLayoutEffect, lazy, Suspense } from 'react';
import { Editor } from './components/Editor';
import { ProfilingHarness } from './components/editor/ProfilingHarness';
import { isElectron } from './utils/exportUtils';

const SolverWindow = lazy(() => import('./components/SolverWindow').then(m => ({ default: m.SolverWindow })));
const SnippetOverlay = lazy(() => import('./components/SnippetOverlay').then(m => ({ default: m.SnippetOverlay })));

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode');
  const isSnippetMode = mode === 'snippet';
  const isSolverMode = mode === 'solver';
  const profileEnabled = import.meta.env.DEV && params.get('profile') === '1';

  useLayoutEffect(() => {
    if (isSnippetMode) {
        document.body.style.backgroundColor = 'transparent';
        document.documentElement.style.backgroundColor = 'transparent';
    } else if (isSolverMode) {
        document.body.style.backgroundColor = '#ffffff';
    } else {
        document.body.style.backgroundColor = '#f8fafc';
    }
  }, [isSnippetMode, isSolverMode]);

  useEffect(() => {
    if (isSnippetMode || isSolverMode) return;
    const handleSecretKey = (e: KeyboardEvent) => {
        if (e.ctrlKey && e.altKey && e.shiftKey && (e.key === 'm' || e.key === 'M')) {
            e.preventDefault();
            if (isElectron()) {
                const { ipcRenderer } = (window as any).require('electron');
                ipcRenderer.send('OPEN_SOLVER');
            } else {
                const url = `${window.location.origin}${window.location.pathname}?mode=solver`;
                window.open(url, 'MathSolver', 'width=500,height=700,menubar=no,toolbar=no,location=no,status=no');
            }
        }
    };
    window.addEventListener('keydown', handleSecretKey);
    return () => window.removeEventListener('keydown', handleSecretKey);
  }, [isSnippetMode, isSolverMode]);

  if (isSnippetMode) return <Suspense fallback={null}><SnippetOverlay /></Suspense>;
  if (isSolverMode) return <Suspense fallback={null}><SolverWindow /></Suspense>;

  return profileEnabled ? <ProfilingHarness><Editor /></ProfilingHarness> : <Editor />;
}
