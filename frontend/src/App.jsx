import { ThemeProvider, CssBaseline } from '@mui/material';
import { Routes, Route } from 'react-router-dom';
import { useMode } from './theme';
import { MsalProvider } from "@azure/msal-react";
import { msalInstance } from "./authConfig";
import { AuthProvider } from './context/AuthContext';

import Topbar from './scenes/global/Topbar';
import Sidebar from './scenes/global/Sidebar';
import Dashboard from './scenes/dashboard';
import Logs from './scenes/logs';
import Tags from './scenes/tags';
import Form from './scenes/form';
import Attendance from "./scenes/attendance";
import CameraAnomalies from "./scenes/CameraAnomalies";

import Fingerprint from "./scenes/fingerprint";
import FingerprintLogs from "./scenes/fingerprint/logs";
import FingerprintEnroll from "./scenes/fingerprint/enroll";
import FingerprintEmployees from "./scenes/fingerprint/employees";
import FingerprintAttendance from "./scenes/fingerprint/attendance";
import DeviceManager from "./scenes/DeviceManager";


import ProtectedRoute from './components/ProtectedRoute';
import UserManagement from './scenes/users';
import DepartmentManager from './scenes/departments';
import AiChat from './scenes/ai-chat';
import AiAnalyst from './scenes/ai-analyst';
import AiRisk from './scenes/ai-risk';
import AiAgent from './scenes/ai-agent';
import AiFlags from './scenes/ai-flags';

function App() {
  const [theme] = useMode();

  return (
    <MsalProvider instance={msalInstance}>
      <AuthProvider>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <div className="app" style={{ display: 'flex', height: '100vh' }}>
            <Sidebar />
            <main className="content" style={{ flexGrow: 1, overflow: 'auto' }}>
              <Topbar />
              <Routes>
                <Route path="/" element={<Dashboard />} />

                {/* 🛡️ Protected: NFC Access Logs & Tags */}
                <Route element={<ProtectedRoute requiredPerm={["LOGS_VIEW_ALL", "LOGS_VIEW_DEPT", "LOGS_VIEW"]} />}>
                  <Route path="/logs" element={<Logs />} />
                  <Route path="/attendance" element={<Attendance />} />
                </Route>

                <Route element={<ProtectedRoute requiredPerm="TAGS_MANAGE" />}>
                  <Route path="/tags" element={<Tags />} />
                  <Route path="/form" element={<Form />} />
                </Route>

                {/* 🛡️ Protected: Fingerprint */}
                <Route element={<ProtectedRoute requiredPerm="FINGERPRINT_MANAGE" />}>
                  <Route path="/fingerprint" element={<Fingerprint />} />
                  <Route path="/fingerprint/logs" element={<FingerprintLogs />} />
                  <Route path="/fingerprint/enroll" element={<FingerprintEnroll />} />
                  <Route path="/fingerprint/employees" element={<FingerprintEmployees />} />
                  <Route path="/fingerprint/attendance" element={<FingerprintAttendance />} />
                </Route>

                {/* 🛡️ Protected: System Admin */}
                <Route element={<ProtectedRoute requiredPerm="DEVICES_MANAGE" />}>
                  <Route path="/devices" element={<DeviceManager />} />
                </Route>

                <Route element={<ProtectedRoute requiredPerm="CAMERA_VIEW" />}>
                  <Route path="/camera-anomalies" element={<CameraAnomalies />} />
                </Route>

                <Route element={<ProtectedRoute requiredPerm="USERS_MANAGE" />}>
                  <Route path="/users" element={<UserManagement />} />
                  <Route path="/departments" element={<DepartmentManager />} />
                </Route>

                {/* 🧠 AI Intelligence */}
                <Route element={<ProtectedRoute requiredPerm="LOGS_VIEW" />}>
                  <Route path="/ai-chat" element={<AiChat />} />
                  <Route path="/ai-analyst" element={<AiAnalyst />} />
                  <Route path="/ai-risk" element={<AiRisk />} />
                  <Route path="/ai-agent" element={<AiAgent />} />
                  <Route path="/ai-flags" element={<AiFlags />} />
                </Route>

              </Routes>
            </main>
          </div>
        </ThemeProvider>
      </AuthProvider>
    </MsalProvider>
  );
}

export default App;