import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { AppArea } from './components/AppArea';
import { ThemeProvider } from './components/layout/ThemeProvider';
import { Toaster } from './components/ui/sonner';
import { ViewsProvider } from './contexts/ViewsContext';

export default function App() {
  return (
    <ThemeProvider>
      <ViewsProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<AppShell />}>
              <Route index element={<Navigate to="." replace />} />
              <Route path="view/:viewId" element={<AppArea />} />
              <Route path="view/:viewId/:recordId" element={<AppArea />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ViewsProvider>
      <Toaster position="top-right" />
    </ThemeProvider>
  );
}
