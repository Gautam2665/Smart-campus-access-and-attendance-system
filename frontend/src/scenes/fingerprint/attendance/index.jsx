import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  Box, Typography, Card, Grid, Chip, CircularProgress, Avatar, List, ListItem, ListItemAvatar, ListItemText, Divider, Stack
} from "@mui/material";
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend, AreaChart, Area
} from "recharts";
import { format, parseISO, subDays, isSameDay } from "date-fns";
import Header from "../../../components/Header";

// 🛡️ Renamed to biometricApi to avoid "already declared" errors
import biometricApi from "../../../api";

// Icons
import FingerprintIcon from "@mui/icons-material/Fingerprint";
import SchoolIcon from "@mui/icons-material/School";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import AccessTimeIcon from "@mui/icons-material/AccessTime";

const COLORS = {
  primary: "#7c4dff",
  success: "#00c853",
  danger: "#d50000",
  warning: "#ffab00",
  info: "#00b0ff",
  neutral: "#9e9e9e",
  pie: ["#6200ea", "#00bfa5", "#ffd600", "#ff6d00", "#d500f9"]
};

const FingerprintAttendance = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // ✅ Moved inside the component to fix "'return' outside of function"
  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      console.log("🔍 [Fingerprint] Fetching logs...");
      const res = await biometricApi.get("/attendance");
      console.log("✅ [Fingerprint] Response Status:", res.status);
      console.log("📦 [Fingerprint] Response Data Type:", typeof res.data, Array.isArray(res.data) ? "Array" : "Not Array");

      const data = res.data;

      if (Array.isArray(data)) {
        const facultyLogs = data.filter(l =>
          l.verification_type?.toLowerCase().includes("finger") ||
          l.source_type?.toLowerCase().includes("finger") ||
          (l.user_role && l.user_role !== 'STUDENT')
        );
        setLogs(facultyLogs);
      } else {
        console.error("⚠️ [Fingerprint] Expected array, received:", data);
        setLogs([]);
      }
    } catch (err) {
      console.error("❌ [Fingerprint] Fetch Logic Error:", err);
      if (err.response) {
        console.error("❌ [Fingerprint] Server returned:", err.response.status, err.response.data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const stats = useMemo(() => {
    if (!logs.length) return null;

    const totalScans = logs.length;
    const uniqueFaculty = new Set(logs.map(l => l.name)).size;
    const anomalyLogs = logs.filter(l => !l.authorized);
    const successRate = totalScans ? (((totalScans - anomalyLogs.length) / totalScans) * 100).toFixed(1) : 0;

    const frequencyMap = {};
    logs.forEach(l => {
      if (!l.name) return;
      frequencyMap[l.name] = (frequencyMap[l.name] || 0) + 1;
    });

    const topFaculty = Object.entries(frequencyMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    const statusData = [
      { name: "Authorized", value: logs.filter(l => l.authorized).length, color: COLORS.success },
      { name: "Denied/Failed", value: logs.filter(l => !l.authorized).length, color: COLORS.danger }
    ];

    const today = new Date();
    const trendData = Array.from({ length: 7 }, (_, i) => {
      const d = subDays(today, 6 - i);
      const dayLogs = logs.filter(l => isSameDay(parseISO(l.timestamp), d));
      return {
        date: format(d, "EEE"),
        Present: dayLogs.filter(l => l.authorized).length,
        Failed: dayLogs.filter(l => !l.authorized).length
      };
    });

    return { totalScans, uniqueFaculty, successRate, topFaculty, statusData, trendData, anomalyLogs };
  }, [logs]);

  if (loading) return <Box display="flex" justifyContent="center" height="80vh" alignItems="center"><CircularProgress /></Box>;

  return (
    <Box m="20px">
      <Header title="FACULTY BIOMETRICS" subtitle="Fingerprint Analytics & Teacher Attendance" />

      {/* KPI ROW */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ p: 2, bgcolor: "#f3e5f5", borderLeft: `4px solid ${COLORS.primary}` }}>
            <Typography variant="subtitle2" color="textSecondary">Total Check-Ins</Typography>
            <Typography variant="h4" fontWeight="bold">{stats?.totalScans || 0}</Typography>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ p: 2, bgcolor: "#e0f2f1", borderLeft: `4px solid ${COLORS.success}` }}>
            <Typography variant="subtitle2" color="textSecondary">Active Faculty</Typography>
            <Typography variant="h4" fontWeight="bold">{stats?.uniqueFaculty || 0}</Typography>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ p: 2, bgcolor: "#e3f2fd", borderLeft: `4px solid ${COLORS.info}` }}>
            <Typography variant="subtitle2" color="textSecondary">Success Rate</Typography>
            <Typography variant="h4" fontWeight="bold">{stats?.successRate || 0}%</Typography>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ p: 2, bgcolor: "#ffebee", borderLeft: `4px solid ${COLORS.danger}` }}>
            <Typography variant="subtitle2" color="textSecondary">Failed Scans</Typography>
            <Typography variant="h4" fontWeight="bold">{stats?.anomalyLogs.length || 0}</Typography>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Card sx={{ p: 3, height: 420 }}>
            <Typography variant="h6" fontWeight="bold" mb={2}>
              <AccessTimeIcon sx={{ verticalAlign: "middle", mr: 1, color: COLORS.primary }} />
              Faculty Presence (Last 7 Days)
            </Typography>
            <Box height="300px">
              {stats?.trendData && (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats.trendData}>
                    <defs>
                      <linearGradient id="colorPres" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.8} />
                        <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Area type="monotone" dataKey="Present" stroke={COLORS.primary} fillOpacity={1} fill="url(#colorPres)" />
                    <Area type="monotone" dataKey="Failed" stroke={COLORS.danger} fillOpacity={0.3} fill={COLORS.danger} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </Box>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card sx={{ p: 3, height: 420 }}>
            <Typography variant="h6" fontWeight="bold" mb={2}>
              <SchoolIcon sx={{ verticalAlign: "middle", mr: 1, color: COLORS.info }} />
              Most Active Faculty
            </Typography>
            <Box height="300px">
              {stats?.topFaculty && (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart layout="vertical" data={stats.topFaculty}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 12 }} />
                    <Tooltip cursor={{ fill: '#f5f5f5' }} />
                    <Bar dataKey="count" fill={COLORS.info} radius={[0, 4, 4, 0]} barSize={25}>
                      {stats.topFaculty.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={index === 0 ? COLORS.success : COLORS.info} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Box>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card sx={{ p: 3 }}>
            <Typography variant="h6" fontWeight="bold" mb={2}>
              <CheckCircleIcon sx={{ verticalAlign: "middle", mr: 1, color: COLORS.success }} />
              Recent Biometric Activity
            </Typography>
            <List sx={{ maxHeight: 400, overflow: 'auto' }}>
              {logs.length > 0 ? logs.slice(0, 20).map((log, i) => (
                <React.Fragment key={i}>
                  <ListItem>
                    <ListItemAvatar>
                      <Avatar sx={{ bgcolor: log.authorized ? COLORS.success : COLORS.danger }}>
                        <FingerprintIcon />
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={<Typography variant="subtitle1" fontWeight="bold">{log.name || "Unknown Faculty"}</Typography>}
                      secondary={log.timestamp ? format(parseISO(log.timestamp), "MMM dd, hh:mm a") : "Unknown Time"}
                    />
                    <Stack direction="row" spacing={1}>
                      <Chip label={log.authorized ? "Verified" : "Failed"} color={log.authorized ? "success" : "error"} size="small" />
                      {log.confidence_score > 0 && <Chip label={`Score: ${log.confidence_score}`} variant="outlined" size="small" />}
                    </Stack>
                  </ListItem>
                  <Divider variant="inset" component="li" />
                </React.Fragment>
              )) : <Typography align="center" mt={4} color="textSecondary">No fingerprint logs found.</Typography>}
            </List>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default FingerprintAttendance;