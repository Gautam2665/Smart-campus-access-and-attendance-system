
import {
  Box,
  Typography,
  useTheme,
  Button,
  Grid,
  Paper,
  Avatar,
  Chip,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Divider
} from "@mui/material";
import { useState, useEffect, useCallback } from "react";
import api from "../../api";
import { useAuth } from "../../context/AuthContext";
import Header from "../../components/Header";
import StatBox from "../../components/StatBox";
import { ResponsivePie } from "@nivo/pie";
import { ResponsiveLine } from "@nivo/line";
import {
  Refresh as RefreshIcon,
  Sensors as SensorsIcon,
  Fingerprint as FingerprintIcon,
  Nfc as NfcIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Security as SecurityIcon,
  Person as PersonIcon
} from "@mui/icons-material";
import { API_BASE_URL } from "../../config";

// ✅ API CONFIG
const API_BASE = API_BASE_URL;
const PI_API = "http://10.78.58.243:5000";
const BUCKET_URL = "https://facerecognitioniot2.s3.ap-south-1.amazonaws.com/";

const Dashboard = () => {
  const theme = useTheme();
  const { hasPermission, user } = useAuth();

  // Data States
  const [stats, setStats] = useState({ authorized: 0, denied: 0 });
  const [recentLogs, setRecentLogs] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [biometricStats, setBiometricStats] = useState([]);
  const [trendData, setTrendData] = useState([]);
  const [loading, setLoading] = useState(true);

  // System Health
  const [health, setHealth] = useState({ online: false, fingerprint: false, nfc: false });

  // 1. Fetch System Health
  const fetchHealth = useCallback(async () => {
    try {
      const res = await api.get(`${PI_API}/api/pi/health`, { timeout: 2000 });
      setHealth({
        online: true,
        fingerprint: res.data.daemons.fingerprint,
        nfc: res.data.daemons.nfc_student,
      });
    } catch (err) {
      // Silent fail for health check to avoid console spam
      setHealth({ online: false, fingerprint: false, nfc: false });
    }
  }, []);

  // 2. Fetch Main Data
  const fetchData = useCallback(async () => {
    setLoading(true);
    fetchHealth();
    try {
      // Parallel Fetch: Stats, Analytics, Raw Logs
      const [statsRes, analyticsRes, logsRes] = await Promise.all([
        api.get(`${API_BASE}/api/stats`),
        api.get(`${API_BASE}/api/attendance/analytics`, {
          params: {
            start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            end: new Date().toISOString().split('T')[0]
          }
        }),
        api.get(`${API_BASE}/api/attendance`) // Fetch raw logs for client-side processing
      ]);

      setStats(statsRes.data);

      // Process Logs for "Live Feed" & "Anomalies"
      // Filter out invalid/empty timestamps if any
      const rawLogs = logsRes.data
        .filter(l => l.timestamp)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      // A. Live Feed (Approved Users)
      // Showing generic "Live Feed" of last 5 attempts regardless of status
      setRecentLogs(rawLogs.slice(0, 5));

      // B. Recent Anomalies (Spoof/Tailgating)
      const recentAnomalies = rawLogs.filter(l =>
        l.verification_type === "SPOOF_ATTEMPT" ||
        l.verification_type === "CAMERA_ANOMALY" ||
        l.metadata?.occupancy_count > 1 ||
        l.authorized === false
      ).slice(0, 3);
      setAnomalies(recentAnomalies);

      // C. Biometric Distribution
      // Count by source_type
      const bioCounts = rawLogs.reduce((acc, curr) => {
        // Normalize source type
        let type = curr.source_type || "UNKNOWN";
        if (curr.verification_type === "FACE_MATCH") type = "CAMERA";

        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {});

      const pieData = [
        { id: "NFC", label: "NFC Card", value: bioCounts["NFC"] || 0, color: "#2196f3" },
        { id: "FINGERPRINT", label: "Biometric", value: bioCounts["FINGERPRINT"] || 0, color: "#9c27b0" },
        { id: "CAMERA", label: "Face Rec", value: bioCounts["CAMERA"] || 0, color: "#ff9800" },
      ].filter(d => d.value > 0);

      setBiometricStats(pieData);

      // D. Trends
      const lines = [
        {
          id: "Authorized",
          color: "#4caf50",
          data: analyticsRes.data.daily_trends.map(d => ({ x: d.date, y: Number(d.authorized) }))
        },
        {
          id: "Denied",
          color: "#f44336",
          data: analyticsRes.data.daily_trends.map(d => ({ x: d.date, y: Number(d.denied) }))
        }
      ];
      setTrendData(lines);

    } catch (err) {
      console.error("Dashboard Sync Error:", err);
    } finally {
      setLoading(false);
    }
  }, [fetchHealth]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // 30s Refresh to reduce log spam
    return () => clearInterval(interval);
  }, [fetchData]);

  // Helper for Icons
  const getSourceIcon = (type) => {
    if (type === "FINGERPRINT") return <FingerprintIcon fontSize="small" />;
    if (type === "NFC") return <NfcIcon fontSize="small" />;
    return <SensorsIcon fontSize="small" />;
  };

  return (
    <Box m="20px">
      {/* HEADER */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Header title="SECURITY COMMAND CENTER" subtitle="Live Biometric & Forensic Intelligence" />
        <Button
          variant="contained"
          sx={{ backgroundColor: theme.palette.secondary.main, color: "white", fontWeight: "bold" }}
          startIcon={<RefreshIcon />}
          onClick={fetchData}
          disabled={loading}
        >
          {loading ? "SYNCING..." : "LIVE SYNC"}
        </Button>
      </Box>

      {/* TOP STAT CARDS */}
      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <StatBox
            title={stats.authorized.toLocaleString()}
            subtitle="Verified Entries"
            progress="0.80"
            increase="+5%"
            icon={<CheckCircleIcon sx={{ color: theme.palette.secondary.main, fontSize: "26px" }} />}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatBox
            title={stats.denied.toLocaleString()}
            subtitle="Security Blocks"
            progress="0.20"
            increase="+12%"
            icon={<SecurityIcon sx={{ color: theme.palette.error.main, fontSize: "26px" }} />}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatBox
            title={anomalies.length.toString()}
            subtitle="Active Anomalies"
            progress={anomalies.length > 0 ? "1.0" : "0"}
            increase="Alert"
            icon={<WarningIcon sx={{ color: "orange", fontSize: "26px" }} />}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 2, height: "100%", bgcolor: theme.palette.primary[400], display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            {hasPermission('ALL_ACCESS') ? (
              <>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                  <Typography variant="h6" fontWeight="600" color="white" component="div">Station Health</Typography>
                  <Chip label={health.online ? "ONLINE" : "OFFLINE"} color={health.online ? "success" : "error"} size="small" />
                </Box>
                <Box display="flex" gap={1}>
                  <Chip icon={<FingerprintIcon />} label={health.fingerprint ? "BIO" : "BIO OFF"} color={health.fingerprint ? "success" : "default"} size="small" variant="outlined" />
                  <Chip icon={<NfcIcon />} label={health.nfc ? "NFC" : "NFC OFF"} color={health.nfc ? "success" : "default"} size="small" variant="outlined" />
                </Box>
              </>
            ) : (
              <>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                  <Typography variant="h6" fontWeight="600" color="white" component="div">My Profile</Typography>
                  <PersonIcon />
                </Box>
                <Box display="flex" gap={1}>
                  <Chip label={user?.role || "Student"} color="primary" size="small" />
                  {user?.department && (
                    <Chip label={user.department} color="secondary" size="small" variant="outlined" />
                  )}
                </Box>
              </>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* MAIN CONTENT GRID */}
      <Grid container spacing={3}>

        {/* ROW 1: LINE CHART (Left) & LIVE FEED (Right) */}
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3, height: "400px", bgcolor: theme.palette.primary[400], borderRadius: "12px" }}>
            {/* Fixed Nesting: component="div" */}
            <Typography variant="h5" fontWeight="600" mb={2} component="div">Access Traffic & Security Threats</Typography>
            <Box height="320px">
              <ResponsiveLine
                data={trendData}
                margin={{ top: 20, right: 30, bottom: 50, left: 50 }}
                xScale={{ type: "point" }}
                yScale={{ type: "linear", min: "auto", max: "auto", stacked: false }}
                axisBottom={{ tickSize: 5, tickPadding: 5, tickRotation: 0, legend: "Last 7 Days", legendOffset: 36, legendPosition: "middle" }}
                axisLeft={{ tickSize: 5, tickPadding: 5, tickRotation: 0, legend: "Events", legendOffset: -40, legendPosition: "middle" }}
                colors={{ datum: "color" }}
                enablePoints={true}
                pointSize={8}
                useMesh={true}
                enableGridX={false}
                theme={{
                  axis: { domain: { line: { stroke: theme.palette.grey[100] } }, ticks: { text: { fill: theme.palette.grey[100] } } },
                  grid: { line: { stroke: theme.palette.grey[700], strokeWidth: 1 } },
                  tooltip: { container: { color: "#333" } }
                }}
              />
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, height: "400px", bgcolor: theme.palette.primary[400], borderRadius: "12px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <Typography variant="h5" fontWeight="600" mb={2} component="div">Live Access Feed</Typography>
            <List sx={{ overflowY: "auto", flex: 1, '&::-webkit-scrollbar': { width: '0.4em' }, '&::-webkit-scrollbar-thumb': { backgroundColor: '#555' } }}>
              {recentLogs.map((log, i) => (
                <div key={i}>
                  <ListItem alignItems="flex-start" sx={{ px: 0 }}>
                    <ListItemAvatar>
                      <Avatar sx={{ bgcolor: log.authorized ? theme.palette.secondary.main : theme.palette.error.main, width: 32, height: 32 }}>
                        {getSourceIcon(log.source_type)}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      secondaryTypographyProps={{ component: "div" }}
                      primary={
                        <Box display="flex" justifyContent="space-between">
                          <Typography variant="subtitle2" fontWeight="bold" component="span">
                            {log.name || "Unknown"}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" component="span">
                            {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </Typography>
                        </Box>
                      }
                      secondary={
                        <Box display="flex" justifyContent="space-between" alignItems="center" mt={0.5}>
                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }} component="span">
                            {log.tag_id}
                          </Typography>
                          <Chip
                            label={log.authorized ? "GRANTED" : "DENIED"}
                            size="small"
                            color={log.authorized ? "success" : "error"}
                            sx={{ height: 18, fontSize: "0.6rem" }}
                          />
                        </Box>
                      }
                    />
                  </ListItem>
                  <Divider component="li" />
                </div>
              ))}
              {recentLogs.length === 0 && <Typography variant="caption">No recent logs...</Typography>}
            </List>
          </Paper>
        </Grid>

        {/* ROW 2: BIOMETRIC PIE (Left) & ANOMALY CARDS (Right) */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, height: "350px", bgcolor: theme.palette.primary[400], borderRadius: "12px" }}>
            <Typography variant="h5" fontWeight="600" component="div">Verification Modes</Typography>
            <Box height="280px">
              <ResponsivePie
                data={biometricStats}
                margin={{ top: 20, right: 20, bottom: 40, left: 20 }}
                innerRadius={0.6}
                padAngle={2}
                cornerRadius={4}
                activeOuterRadiusOffset={8}
                colors={{ datum: "data.color" }}
                borderWidth={1}
                borderColor={{ from: "color", modifiers: [["darker", 0.2]] }}
                enableArcLinkLabels={false}
                arcLabelsTextColor="#ffffff"
                theme={{ textColor: theme.palette.grey[100], tooltip: { container: { color: "#333" } } }}
                legends={[
                  {
                    anchor: 'bottom',
                    direction: 'row',
                    justify: false,
                    translateX: 0,
                    translateY: 30,
                    itemsSpacing: 0,
                    itemWidth: 80,
                    itemHeight: 18,
                    itemTextColor: '#999',
                    itemDirection: 'left-to-right',
                    symbolSize: 12,
                    symbolShape: 'circle'
                  }
                ]}
              />
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3, height: "350px", bgcolor: theme.palette.primary[400], borderRadius: "12px", overflow: "hidden" }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h5" fontWeight="600" color="error.main" component="div">
                <WarningIcon sx={{ verticalAlign: 'middle', mr: 1, mb: 0.5 }} />
                Recent Forensic Alerts
              </Typography>
              <Button size="small" color="error" href="/camera-anomalies" variant="outlined">VIEW ALL</Button>
            </Box>

            <Grid container spacing={2}>
              {anomalies.length === 0 ? (
                <Grid item xs={12}>
                  <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height="200px" color="text.disabled">
                    <CheckCircleIcon sx={{ fontSize: 60, mb: 2, opacity: 0.5 }} />
                    <Typography component="div">No anomalies detected recently.</Typography>
                  </Box>
                </Grid>
              ) : (
                anomalies.map((evt, i) => (
                  <Grid item xs={12} sm={4} key={i}>
                    <Box
                      sx={{
                        border: "1px solid",
                        borderColor: "error.dark",
                        borderRadius: "8px",
                        overflow: "hidden",
                        position: "relative",
                        height: "220px", // Fixed height for consistency
                        bgcolor: "black"
                      }}
                    >
                      {/* Image Layer - Fixed logic to match CameraAnomalies */}
                      <Box
                        component="img"
                        src={`${BUCKET_URL}${(evt.metadata?.evidence_key || evt.metadata?.evidence_url || evt.name + '.jpg')}`}
                        onError={(e) => { e.target.src = "https://placehold.co/300x200/000000/FFF?text=NO+IMAGE"; }}
                        sx={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.8 }}
                      />

                      {/* Text Overlay Layer */}
                      <Box
                        sx={{
                          position: "absolute",
                          bottom: 0,
                          left: 0,
                          right: 0,
                          background: "linear-gradient(to top, rgba(0,0,0,0.95), rgba(0,0,0,0))",
                          p: 1.5,
                          pt: 4
                        }}
                      >
                        <Typography variant="subtitle2" color="white" fontWeight="bold" component="div">
                          {evt.verification_type === "SPOOF_ATTEMPT" ? "SPOOFING" : (evt.metadata?.occupancy_count > 1 ? "TAILGATING" : "UNAUTHORIZED")}
                        </Typography>
                        <Typography variant="caption" color="gray" display="block" component="span">
                          {new Date(evt.timestamp).toLocaleString()}
                        </Typography>
                      </Box>
                    </Box>
                  </Grid>
                ))
              )}
            </Grid>
          </Paper>
        </Grid>

      </Grid>
    </Box>
  );
};

export default Dashboard;