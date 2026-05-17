import { BrowserRouter } from 'react-router-dom';
import { Providers } from './app/Providers';
import { Router } from './routes/Router';

export default function App() {
  return (
    <BrowserRouter>
      <Providers>
        <Router />
      </Providers>
    </BrowserRouter>
  );
}
