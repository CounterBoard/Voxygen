import React from 'react';
import ReactDOM from 'react-dom/client';
import './theme/theme-tokens.css';
import './theme/app-shell.css';
import App from './App.jsx';

if (window.Telegram && window.Telegram.WebApp) {
  window.Telegram.WebApp.ready();
  window.Telegram.WebApp.expand();
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
