import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';
import 'reactflow/dist/style.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Root element #root was not found.');
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
