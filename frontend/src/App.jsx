import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import ProtectedRoute from './components/layout/ProtectedRoute';
import OfflineBanner from './components/layout/OfflineBanner';

const LoginPage          = lazy(() => import('./pages/LoginPage'));
const DashboardPage      = lazy(() => import('./pages/DashboardPage'));
const IncidentsPage      = lazy(() => import('./pages/IncidentsPage'));
const IncidentDetailPage = lazy(() => import('./pages/IncidentDetailPage'));
const UsersPage          = lazy(() => import('./pages/UsersPage'));
const ReportsPage        = lazy(() => import('./pages/ReportsPage'));
const ConfigPage         = lazy(() => import('./pages/ConfigPage'));
const MapPage            = lazy(() => import('./pages/MapPage'));
const MaintenancePage    = lazy(() => import('./pages/MaintenancePage'));
const OnCallPage         = lazy(() => import('./pages/OnCallPage'));
const ClientDirectoryPage = lazy(() => import('./pages/ClientDirectoryPage'));

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30000 } } });

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <SocketProvider>
          <BrowserRouter>
            <Suspense fallback={null}>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
                <Route path="/incidencias" element={<ProtectedRoute><IncidentsPage /></ProtectedRoute>} />
                <Route path="/incidencias/:id" element={<ProtectedRoute><IncidentDetailPage /></ProtectedRoute>} />
                <Route path="/usuarios" element={<ProtectedRoute roles={['admin']}><UsersPage /></ProtectedRoute>} />
                <Route path="/reportes" element={<ProtectedRoute roles={['admin', 'supervisor']}><ReportsPage /></ProtectedRoute>} />
                <Route path="/configuracion" element={<ProtectedRoute roles={['admin']}><ConfigPage /></ProtectedRoute>} />
                <Route path="/mapa" element={<ProtectedRoute roles={['admin', 'supervisor', 'technician']}><MapPage /></ProtectedRoute>} />
                <Route path="/mantenimientos" element={<ProtectedRoute roles={['admin', 'supervisor']}><MaintenancePage /></ProtectedRoute>} />
                <Route path="/guardia" element={<ProtectedRoute roles={['admin', 'supervisor']}><OnCallPage /></ProtectedRoute>} />
                <Route path="/clientes" element={<ProtectedRoute roles={['admin', 'supervisor', 'technician']}><ClientDirectoryPage /></ProtectedRoute>} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
          <OfflineBanner />
          <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
        </SocketProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
