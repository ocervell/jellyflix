import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { ApiProvider } from './hooks/useApi';
import { initFocus } from './lib/tv/focus';
import { TvBackProvider } from './lib/tv/back';
import './styles/reset.css';
import './styles/tokens.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false } },
});

initFocus();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ApiProvider>
      <QueryClientProvider client={queryClient}>
        <TvBackProvider>
          <App />
        </TvBackProvider>
      </QueryClientProvider>
    </ApiProvider>
  </StrictMode>,
);
