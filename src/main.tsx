import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import '@fontsource/outfit/500.css';
import '@fontsource/outfit/600.css';
import App from './product/App';
const DoctorView = React.lazy(() => import('./product/Doctor'));
const Landing = React.lazy(() => import('./product/Landing'));
const routes: Record<string, React.ComponentType> = { '/doctor': DoctorView, '/about': Landing };
const Page = routes[location.pathname.replace(/\/+$/, '')] ?? App;
class Boundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <main className="fatal"><h1>Let’s get you back.</h1><p>The screen could not load. Saved server records have not been changed.</p><button onClick={() => location.reload()}>Reload application</button></main> : this.props.children; }
}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Boundary><React.Suspense fallback={null}><Page /></React.Suspense></Boundary></React.StrictMode>);
if ('serviceWorker' in navigator && import.meta.env.PROD) void navigator.serviceWorker.register('/sw.js');