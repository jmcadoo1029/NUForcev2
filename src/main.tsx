import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './theme/tokens.css'
import { applyThemePref, getThemePref } from './theme/theme'

// Apply the saved Light/Dark/Auto choice. index.html already does this inline
// before first paint (no flash); this keeps it correct through client renders.
applyThemePref(getThemePref())

// BrowserRouter gives every quote a real URL (e.g. /quote/26-224B), which is
// what makes right-click "open in new tab", middle-click, and bookmarking work
// natively — a V2 requirement.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
