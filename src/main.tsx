import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { WordbookProvider } from './state/WordbookContext';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WordbookProvider>
      <App />
    </WordbookProvider>
  </StrictMode>
);
