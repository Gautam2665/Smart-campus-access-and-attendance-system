import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  Box, Typography, Card, Grid, Chip, CircularProgress, Avatar, List, ListItem, ListItemAvatar, ListItemText, Divider
} from "@mui/material";
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend, AreaChart, Area
} from "recharts";
import { format, parseISO, subDays, isSameDay } from "date-fns";
import Header from "../../components/Header";
import api from "../../api";

// Icons
import SecurityIcon from "@mui/icons-material/Security";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import PersonIcon from "@mui/icons-material/Person";
import GppBadIcon from "@mui/icons-material/GppBad";
import CameraFrontIcon from "@mui/icons-material/CameraFront";

const COLORS = {
  primary: "#1976d2",
  success: "#2e7c31",
  danger: "#d32f2f",
  warning: "#ed6c02",
  info: "#0288d1",
  neutral: "#757575",
  pie: ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#AF19FF"]
};

const AdvancedAnalytics = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // ✅ Wrapped in useCallback to prevent re-renders
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);

      // 1. Fetch User's Linked Tag ID
      let myTagId = null;
      try {
        const tagRes = await api.get("/me/tag");
        if (tagRes.data.status === "success") {
          myTagId = tagRes.data.tag_id;
          console.log("👤 [Analytics] User Tag Found:", myTagId);
        }
      } catch (e) {
        console.warn("⚠️ [Analytics] No linked tag for this user.");
      }

      // 2. Fetch Global Logs
      const res = await api.get("/attendance");
      const data = res.data;

      if (Array.isArray(data)) {
        // 3. STRICT FILTERING LOGIC
        const relevantLogs = data.filter(l => {
          const isFingerprint = l.verification_type?.toLowerCase().includes("finger") ||
            l.source_type?.toLowerCase().includes("finger");

          // ✅ Convert both to String to avoid type mismatch (e.g., 799 vs "799")
          const isMyLog = myTagId ? String(l.tag_id) === String(myTagId) : true;

          return !isFingerprint && isMyLog;
        });

        setLogs(relevantLogs);
      }
    } catch (err) {
      console.error("Fetch Error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const stats = useMemo(() => {
    if (!logs.length) return null;

    const totalScans = logs.length;
    const uniqueStudents = new Set(logs.map(l => l.tag_id)).size;

    const anomalyLogs = logs.filter(l => !l.authorized || l.verification_type === 'SPOOF_ATTEMPT' || l.verification_type === 'CAMERA_ANOMALY');
    const anomalyCount = anomalyLogs.length;
    const anomalyRate = ((anomalyCount / totalScans) * 100).toFixed(1);

    const frequencyMap = {};
    logs.forEach(l => {
      if (!l.name) return;
      frequencyMap[l.name] = (frequencyMap[l.name] || 0) + 1;
    });

    const topStudents = Object.entries(frequencyMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    const anomalyTypes = { "Spoof Attempt": 0, "Identity Mismatch": 0, "Unknown Tag": 0, "Tailgating": 0 };

    anomalyLogs.forEach(l => {
      const type = l.verification_type;
      const meta = typeof l.metadata === 'string' ? JSON.parse(l.metadata || '{}') : l.metadata;

      if (type === 'SPOOF' || type === 'SPOOF_ATTEMPT' || meta?.anomaly_type === 'SPOOF') anomalyTypes["Spoof Attempt"]++;
      else if (type === 'MISMATCH' || type === 'IDENTITY_MISMATCH' || meta?.anomaly_type === 'IDENTITY_MISMATCH') anomalyTypes["Identity Mismatch"]++;
      else if (meta?.anomaly_type === 'TAILGATING') anomalyTypes["Tailgating"]++;
      else anomalyTypes["Unknown Tag"]++;
    });

    const anomalyData = Object.keys(anomalyTypes)
      .filter(k => anomalyTypes[k] > 0)
      .map((name, i) => ({ name, value: anomalyTypes[name], color: COLORS.pie[i % COLORS.pie.length] }));

    const today = new Date();
    const trendData = Array.from({ length: 7 }, (_, i) => {
      const d = subDays(today, 6 - i);
      const dayLogs = logs.filter(l => isSameDay(parseISO(l.timestamp), d));
      return {
        date: format(d, "EEE"),
        Authorized: dayLogs.filter(l => l.authorized).length,
        SecurityEvents: dayLogs.filter(l => !l.authorized).length
      };
    });

    return { totalScans, uniqueStudents, anomalyCount, anomalyRate, topStudents, anomalyData, trendData, anomalyLogs };
  }, [logs]);

  if (loading) return <Box display="flex" justifyContent="center" height="80vh" alignItems="center"><CircularProgress /></Box>;

  return (
    <Box m="20px">
      <Header title="SECURITY ANALYTICS" subtitle="Deep Dive into Attendance & Threats" />

      {/* KPI ROW */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ p: 2, bgcolor: "#e3f2fd", borderLeft: `4px solid ${COLORS.primary}` }}>
            <Typography variant="subtitle2" color="textSecondary">Total Scans</Typography>
            <Typography variant="h4" fontWeight="bold">{stats?.totalScans || 0}</Typography>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ p: 2, bgcolor: "#e8f5e9", borderLeft: `4px solid ${COLORS.success}` }}>
            <Typography variant="subtitle2" color="textSecondary">Unique Students</Typography>
            <Typography variant="h4" fontWeight="bold">{stats?.uniqueStudents || 0}</Typography>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ p: 2, bgcolor: "#ffebee", borderLeft: `4px solid ${COLORS.danger}` }}>
            <Typography variant="subtitle2" color="textSecondary">Security Incidents</Typography>
            <Typography variant="h4" fontWeight="bold">{stats?.anomalyCount || 0}</Typography>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ p: 2, bgcolor: "#fff3e0", borderLeft: `4px solid ${COLORS.warning}` }}>
            <Typography variant="subtitle2" color="textSecondary">Threat Rate</Typography>
            <Typography variant="h4" fontWeight="bold">{stats?.anomalyRate || 0}%</Typography>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Card sx={{ p: 3, height: 420 }}>
            <Typography variant="h6" fontWeight="bold" mb={2}>
              <SecurityIcon sx={{ verticalAlign: "middle", mr: 1, color: COLORS.primary }} />
              Access vs Threats (Last 7 Days)
            </Typography>
            <ResponsiveContainer width="100%" height="90%">
              <AreaChart data={stats?.trendData}>
                <defs>
                  <linearGradient id="colorAuth" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.success} stopOpacity={0.8} />
                    <stop offset="95%" stopColor={COLORS.success} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorSec" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.danger} stopOpacity={0.8} />
                    <stop offset="95%" stopColor={COLORS.danger} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="Authorized" stroke={COLORS.success} fillOpacity={1} fill="url(#colorAuth)" />
                <Area type="monotone" dataKey="SecurityEvents" name="Security Events" stroke={COLORS.danger} fillOpacity={1} fill="url(#colorSec)" />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card sx={{ p: 3, height: 420 }}>
            <Typography variant="h6" fontWeight="bold" mb={2}>
              <PersonIcon sx={{ verticalAlign: "middle", mr: 1, color: COLORS.info }} />
              Frequent Access
            </Typography>
            <ResponsiveContainer width="100%" height="90%">
              <BarChart layout="vertical" data={stats?.topStudents}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={80} />
                <Tooltip />
                <Bar dataKey="count" fill={COLORS.info} radius={[0, 4, 4, 0]} barSize={30}>
                  {stats?.topStudents.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index === 0 ? COLORS.success : COLORS.info} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card sx={{ p: 3, height: 380 }}>
            <Typography variant="h6" fontWeight="bold" mb={2}>
              <WarningAmberIcon sx={{ verticalAlign: "middle", mr: 1, color: COLORS.warning }} />
              Threat Distribution
            </Typography>
            <Box height="250px" display="flex" justifyContent="center">
              {stats?.anomalyData.length > 0 ? (
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={stats.anomalyData} innerRadius={60} outerRadius={90} paddingAngle={5} dataKey="value">
                      {stats.anomalyData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height="100%">
                  <GppBadIcon sx={{ fontSize: 60, color: COLORS.neutral, opacity: 0.3 }} />
                  <Typography color="textSecondary" mt={1}>No Threats Detected</Typography>
                </Box>
              )}
            </Box>
          </Card>
        </Grid>

        <Grid item xs={12} md={8}>
          <Card sx={{ p: 3, height: 380, overflow: "hidden" }}>
            <Typography variant="h6" fontWeight="bold" mb={2} color="error">
              <CameraFrontIcon sx={{ verticalAlign: "middle", mr: 1 }} />
              Recent Camera Anomalies
            </Typography>
            <List sx={{ maxHeight: 300, overflow: 'auto' }}>
              {stats?.anomalyLogs.slice(0, 10).map((log, i) => (
                <React.Fragment key={i}>
                  <ListItem alignItems="flex-start">
                    <ListItemAvatar>
                      <Avatar sx={{ bgcolor: COLORS.danger }}><WarningAmberIcon /></Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={<Typography variant="subtitle1" fontWeight="bold">{log.name || "Unknown"} — {log.verification_type?.replace("CAMERA_ANOMALY", "MISMATCH") || "Security Alert"}</Typography>}
                      secondary={<>{format(parseISO(log.timestamp), "MMM dd, hh:mm a")} — {log.metadata?.security_note || "Unauthorized access attempt detected."}</>}
                    />
                    <Chip label={log.confidence_score != null ? `${log.confidence_score > 1 ? log.confidence_score.toFixed(0) : (log.confidence_score * 100).toFixed(0)}% Match` : "FAILED"} size="small" color="error" variant="outlined" />
                  </ListItem>
                  <Divider variant="inset" component="li" />
                </React.Fragment>
              ))}
              {stats?.anomalyLogs.length === 0 && <Typography align="center" mt={8} color="textSecondary">Secure: No anomalies recorded.</Typography>}
            </List>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default AdvancedAnalytics;