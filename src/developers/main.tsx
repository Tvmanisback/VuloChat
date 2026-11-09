import React from 'react';
import ReactDOM from 'react-dom/client';
import '../index.css';
import DeveloperPortal from '../components/DeveloperPortal';

// The developer portal is its own page at /developers. It needs no sign-in.
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <DeveloperPortal />
  </React.StrictMode>,
);
