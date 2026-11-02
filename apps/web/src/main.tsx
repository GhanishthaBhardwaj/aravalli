import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
import './styles/tokens.css';
import { App } from './app/App';
import { Providers } from './app/providers';
import { ThemeProvider } from './components/ui/theme';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      {/* reducedMotion="user" turns movement off for people who ask their system for less motion */}
      <MotionConfig reducedMotion="user">
        <BrowserRouter>
          <Providers>
            <App />
          </Providers>
        </BrowserRouter>
      </MotionConfig>
    </ThemeProvider>
  </React.StrictMode>,
);
