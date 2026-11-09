import React from 'react';
import ReactDOM from 'react-dom/client';
import '../index.css';
import DevDocs from '../components/DevDocs';

// The bot documentation is its own page at /dev-docs. It needs no sign-in.
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <DevDocs />
  </React.StrictMode>,
);
