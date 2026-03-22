import React, { useEffect, useState, useCallback, useMemo } from "react"; // 👈 ADD useMemo HERE
import {
  Box, Typography, Card, Grid, Chip, Divider, CircularProgress,
  Stack, Tooltip, IconButton, Stepper, Step, StepLabel, LinearProgress,
  Container, Button, Collapse, Fade,
  TextField, InputAdornment, Pagination // 👈 ADD THESE Missing MUI Components
} from "@mui/material";

import {
  AccessTime, Download, Visibility,
  Group as GroupIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  VerifiedUser as VerifiedUserIcon,
  GppBad as GppBadIcon,
  Psychology as PsychologyIcon,
  ExpandMore as ExpandMoreIcon,
  Search as SearchIcon // 👈 ADD THIS Missing Icon
} from "@mui/icons-material";

import Header from "../../components/Header";
import api from "../../api";
import { API_URL } from "../../config";

// -----------------------------
// 🎨 Custom Stepper Styles
// -----------------------------
const CustomStepIcon = (props) => {
  const { completed, error } = props;
  if (error) return <ErrorIcon color="error" />;
  if (completed) return <CheckCircleIcon color="success" />;
  return <VerifiedUserIcon color="disabled" />;
};

const CameraAnomalies = () => {
  const [anomalies, setAnomalies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [aiResults, setAiResults] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const itemsPerPage = 12;   // { [event.id]: { loading, result, error, open } }

  const BUCKET_URL = "https://facerecognitioniot2.s3.ap-south-1.amazonaws.com/";

  const fetchAnomalies = useCallback(async () => {
    try {
      // 🚀 Using intercepted Axios instance handles Azure tokens automatically
      const response = await api.get("/attendance");

      // Axios stores the payload in .data
      const data = response.data;

      // 🛑 GUARD: Fixes "data.filter is not a function" by verifying array type
      if (!Array.isArray(data)) {
        console.error("⚠️ Expected array but received:", data);
        return;
      }

      const fetchCycleId = new Date().getTime();

      const processed = data
        .filter(
          (log) => !log.authorized &&
            (log.verification_type === "CAMERA_ANOMALY" || log.verification_type === "SPOOF_ATTEMPT" || log.metadata?.anomaly_type)
        )
        .map((log) => {
          // 🛠️ Parse Metadata (Handle string or object)
          const meta = typeof log.metadata === 'string' ? JSON.parse(log.metadata) : (log.metadata || {});

          const expectedName = log.name || "Unknown";
          const detectedName = meta.detected_name || "Unrecognized";
          const anomalyType = meta.anomaly_type || "UNKNOWN";
          const peopleCount = meta.occupancy_count || 1;
          const securityNote = meta.security_note || "Security alert triggered.";

          // 🚨 Classify Threat
          // 1. Broadly check for Spoof
          const isSpoof = anomalyType === "SPOOF" || log.tag_id?.startsWith("SPOOF-") || log.verification_type === "SPOOF_ATTEMPT";

          // 2. Advanced Velocity Checks
          const isCredentialSharing = log.verification_type === "CREDENTIAL_SHARING" || anomalyType === "CREDENTIAL_SHARING";
          const isRunaway = log.verification_type === "IMPOSSIBLE_RUNAWAY" || anomalyType === "IMPOSSIBLE_RUNAWAY";

          // 3. Mismatch Logic
          const isMismatch = !isSpoof && !isCredentialSharing && !isRunaway && (anomalyType === "IDENTITY_MISMATCH" || log.verification_type === "IDENTITY_MISMATCH" || log.verification_type === "CAMERA_ANOMALY");

          // 4. Tailgating is fallback
          const isTailgating = peopleCount > 1 && !isSpoof && !isMismatch && !isCredentialSharing && !isRunaway;

          const isUnrecognized = detectedName === "Unrecognized";

          // 📊 Evidence Chain Logic
          const evidenceChain = [
            { label: "NFC Scan", status: "success" },
            { label: "Liveness", status: (isSpoof || isCredentialSharing) ? "error" : "success" },
            { label: "Face Match", status: (isMismatch || isUnrecognized || isRunaway) ? "error" : "success" },
            { label: "Occupancy", status: isTailgating ? "warning" : "success" }
          ];

          return {
            ...log,
            meta,
            expectedName,
            detectedName,
            peopleCount,
            isTailgating,
            isSpoof,
            isMismatch,
            isCredentialSharing,
            isRunaway,
            securityNote,
            cacheBuster: `${log.id}-${fetchCycleId}`,
            safeTimestamp: log.timestamp || new Date(),
            evidenceChain
          };
        })
        .sort((a, b) => new Date(b.safeTimestamp) - new Date(a.safeTimestamp));

      setAnomalies(processed);
    } catch (err) {
      console.error("Audit fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnomalies();
    const interval = setInterval(fetchAnomalies, 5000);
    return () => clearInterval(interval);
  }, [fetchAnomalies]);

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleString("en-IN", {
      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
    });
  };

  const analyzeWithAI = async (event) => {
    const id = event.id;
    const imageUrl = `${BUCKET_URL}${event.meta.evidence_key || `${event.name}.jpg`}`;
    setAiResults(prev => ({ ...prev, [id]: { loading: true, result: null, error: null, open: true } }));
    try {
      const res = await api.post('/ai/analyze-image', {
        image_url: imageUrl,
        log_context: {
          name: event.expectedName,
          verification_type: event.meta.anomaly_type || 'CAMERA_ANOMALY',
          timestamp: event.safeTimestamp,
        }
      });
      setAiResults(prev => ({ ...prev, [id]: { loading: false, result: res.data, error: null, open: true } }));
    } catch (err) {
      setAiResults(prev => ({ ...prev, [id]: { loading: false, result: null, error: err.response?.data?.error || 'Analysis failed', open: true } }));
    }
  };

  const THREAT_COLORS = { LOW: 'success', MODERATE: 'warning', HIGH: 'error', UNKNOWN: 'default' };

  const handleViewEvidence = (event) => {
    const imageUrl = `${BUCKET_URL}${event.meta?.evidence_key || `${event.name}.jpg`}?v=${event.cacheBuster}`;
    window.open(imageUrl, '_blank');
  };

  const handleDownloadReport = (event) => {
    const r = aiResults[event.id]?.result;
    let aiText = "Not analyzed yet.";
    if (r) {
      aiText = `Threat Level: ${r.threat_level}\nConfidence: ${r.confidence}\nScene: ${r.description}\nRecommendation: ${r.recommendation}`;
    }

    const content = `SECURITY ANOMALY REPORT
=======================
ID: ${event.id}
Timestamp: ${formatTime(event.safeTimestamp)}
Type: ${event.verification_type}
Actor: ${event.expectedName}

DETAILS
-------
Detected Face: ${event.detectedName || 'N/A'}
Occupancy: ${event.peopleCount}
System Note: ${event.securityNote}

AI FORENSICS
------------
${aiText}
`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Incident_${event.id}_Report.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Filter & Pagination Logic ───
  const filteredAnomalies = useMemo(() => {
    return anomalies.filter((a) => {
      const s = searchTerm.toLowerCase();
      return (
        a.expectedName.toLowerCase().includes(s) ||
        a.detectedName.toLowerCase().includes(s) ||
        (a.meta?.anomaly_type || "").toLowerCase().includes(s)
      );
    });
  }, [anomalies, searchTerm]);

  const pageCount = Math.ceil(filteredAnomalies.length / itemsPerPage);
  const currentItems = useMemo(() => {
    const start = (page - 1) * itemsPerPage;
    return filteredAnomalies.slice(start, start + itemsPerPage);
  }, [filteredAnomalies, page]);

  // Reset page when search changes
  useEffect(() => { setPage(1); }, [searchTerm]);

  if (loading && anomalies.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="80vh">
        <CircularProgress size={60} thickness={4} />
      </Box>
    );
  }

  return (
    <Box m="20px">
      <Box display="flex" justifyContent="space-between" alignItems="flex-end" mb={2}>
        <Header title="CAMERA FORENSICS" subtitle="Deep Dive Analysis of Security Exceptions" />
        <TextField
          variant="outlined"
          placeholder="Search suspects or anomaly type..."
          size="small"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          sx={{ width: 300, bgcolor: "background.paper", borderRadius: 1 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon color="action" />
              </InputAdornment>
            ),
          }}
        />
      </Box>

      {/* 📊 SUMMARY CARDS */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={8}>
          <Card sx={{ p: 3, background: 'linear-gradient(135deg, #ae2012 0%, #9b2226 100%)', color: 'white' }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Box>
                <Typography variant="h4" fontWeight="800" color="white">
                  {anomalies.length} High-Risk Events
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.9, mt: 1, fontWeight: 500 }}>
                  {anomalies.filter(a => a.isCredentialSharing).length} Impossible Travels • {anomalies.filter(a => a.isRunaway).length} Runaways • {anomalies.filter(a => a.isSpoof).length} Spoofs
                </Typography>
              </Box>
              <GppBadIcon sx={{ fontSize: 60, opacity: 0.6 }} />
            </Stack>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card sx={{ p: 3 }}>
            <Typography variant="subtitle2" color="textSecondary" fontWeight="bold">THREAT LEVEL</Typography>
            <Stack direction="row" alignItems="center" spacing={2} mt={2}>
              <LinearProgress variant="determinate" value={anomalies.length > 5 ? 80 : 30}
                color={anomalies.length > 5 ? "error" : "warning"}
                sx={{ flex: 1, height: 10, borderRadius: 5 }}
              />
              <Typography fontWeight="bold" color={anomalies.length > 5 ? "error.main" : "warning.main"}>
                {anomalies.length > 5 ? "CRITICAL" : "MODERATE"}
              </Typography>
            </Stack>
          </Card>
        </Grid>
      </Grid>

      {/* 🚨 ANOMALY FEED */}
      <Grid container spacing={3}>
        {currentItems.map((event) => {
          // Determine Label and Color
          let label = "TAILGATING";
          let color = "warning";

          if (event.isCredentialSharing) { label = "CREDENTIAL SHARING"; color = "error"; }
          else if (event.isRunaway) { label = "IMPOSSIBLE RUNAWAY"; color = "error"; }
          else if (event.isSpoof) { label = "SPOOF ATTEMPT"; color = "error"; }
          else if (event.isMismatch) { label = "IDENTITY MISMATCH"; color = "error"; }

          return (
            <Grid item xs={12} md={6} lg={4} key={event.id}>
              <Card
                sx={{
                  position: 'relative',
                  borderRadius: 3,
                  boxShadow: 4,
                  overflow: 'visible',
                  transition: 'transform 0.2s',
                  '&:hover': { transform: 'translateY(-4px)' }
                }}
              >
                {/* 🏷️ THREAT TYPE BADGE */}
                <Chip
                  label={label}
                  color={color}
                  sx={{
                    position: 'absolute', top: -12, left: 20, zIndex: 2,
                    fontWeight: 'bold', boxShadow: 3, letterSpacing: 0.5
                  }}
                />

                {/* 🖼️ EVIDENCE IMAGE */}
                <Box sx={{ height: 240, bgcolor: "#000", position: "relative", borderTopLeftRadius: 12, borderTopRightRadius: 12, overflow: 'hidden' }}>
                  <img
                    src={`${BUCKET_URL + (event.meta.evidence_key || `${event.name}.jpg`)}?v=${event.cacheBuster}`}
                    alt="Evidence"
                    style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.95 }}
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = "data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300' viewBox='0 0 400 300'%3e%3crect fill='%23ddd' width='400' height='300'/%3e%3ctext fill='rgba(0,0,0,0.5)' font-family='sans-serif' font-size='30' dy='10.5' font-weight='bold' x='50%25' y='50%25' text-anchor='middle'%3eNO EVIDENCE%3c/text%3e%3c/svg%3e";
                    }}
                  />

                  {/* Live Data Overlay */}
                  <Box sx={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)',
                    p: 2, pt: 4
                  }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-end">
                      <Box>
                        <Typography variant="caption" color="rgba(255,255,255,0.7)">CARD HOLDER</Typography>
                        <Typography variant="h6" color="white" fontWeight="bold" lineHeight={1}>
                          {event.expectedName}
                        </Typography>
                      </Box>

                      {/* If mismatch, show who was actually detected */}
                      {event.isMismatch && (
                        <Box textAlign="right">
                          <Typography variant="caption" color="error.light">DETECTED FACE</Typography>
                          <Typography variant="h6" color="error.light" fontWeight="bold" lineHeight={1}>
                            {event.detectedName}
                          </Typography>
                        </Box>
                      )}
                    </Stack>
                  </Box>

                  {/* Occupancy Count Badge */}
                  <Chip
                    icon={<GroupIcon sx={{ fill: 'white !important' }} />}
                    label={event.peopleCount}
                    size="small"
                    sx={{
                      position: 'absolute', top: 10, right: 10,
                      bgcolor: event.peopleCount > 1 ? 'error.main' : 'rgba(0,0,0,0.6)',
                      color: 'white', fontWeight: 'bold'
                    }}
                  />
                </Box>

                {/* 📝 INVESTIGATION STEPS */}
                <Box sx={{ p: 2 }}>
                  <Stepper alternativeLabel activeStep={4} sx={{ mb: 2 }}>
                    {event.evidenceChain.map((step, index) => (
                      <Step key={index} completed={true}>
                        <StepLabel StepIconComponent={() => <CustomStepIcon completed={step.status === 'success'} error={step.status !== 'success'} />}>
                          <Typography variant="caption" color={step.status !== 'success' ? "error.main" : "textSecondary"} fontWeight={step.status !== 'success' ? "bold" : "normal"}>
                            {step.label}
                          </Typography>
                        </StepLabel>
                      </Step>
                    ))}
                  </Stepper>

                  {/* Security Note Alert */}
                  <Box sx={{ bgcolor: '#fff4f4', p: 1.5, borderRadius: 2, border: '1px solid #ffcdd2', display: 'flex', gap: 1.5 }}>
                    <WarningIcon color="error" fontSize="small" sx={{ mt: 0.3 }} />
                    <Box>
                      <Typography variant="caption" fontWeight="bold" color="error.main" display="block">
                        SECURITY ANALYSIS
                      </Typography>
                      <Typography variant="body2" fontSize="0.85rem" color="text.primary">
                        {event.securityNote}
                      </Typography>
                    </Box>
                  </Box>
                </Box>

                <Divider />

                {/* 🦶 FOOTER */}
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ p: 1.5, px: 2.5, bgcolor: '#fafafa' }}>
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <AccessTime sx={{ fontSize: 16, color: 'text.secondary' }} />
                    <Typography variant="caption" color="textSecondary" fontWeight="bold">
                      {formatTime(event.safeTimestamp)}
                    </Typography>
                  </Stack>
                  <Stack direction="row" spacing={1}>
                    <Tooltip title="Analyze with Gemini Vision">
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={aiResults[event.id]?.loading
                          ? <CircularProgress size={14} color="inherit" />
                          : <PsychologyIcon fontSize="small" />}
                        onClick={() => analyzeWithAI(event)}
                        disabled={aiResults[event.id]?.loading}
                        sx={{ bgcolor: '#5c35be', '&:hover': { bgcolor: '#4527a0' }, fontSize: '0.7rem', px: 1.5 }}
                      >
                        {aiResults[event.id]?.loading ? 'Analyzing...' : 'AI Analyze'}
                      </Button>
                    </Tooltip>
                    <Tooltip title="View Evidence">
                      <IconButton size="small" onClick={() => handleViewEvidence(event)}>
                        <Visibility fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Download Report">
                      <IconButton size="small" onClick={() => handleDownloadReport(event)}>
                        <Download fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </Stack>

                {/* 🧠 AI ANALYSIS RESULT PANEL */}
                <Collapse in={!!aiResults[event.id]?.open}>
                  <Box sx={{ p: 2, bgcolor: '#f3f0ff', borderTop: '1px solid #d1c4e9' }}>
                    {aiResults[event.id]?.error && (
                      <Typography variant="caption" color="error">{aiResults[event.id].error}</Typography>
                    )}
                    {aiResults[event.id]?.result && (() => {
                      const r = aiResults[event.id].result;
                      return (
                        <Stack spacing={1}>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Chip
                              label={r.threat_level || 'UNKNOWN'}
                              color={THREAT_COLORS[r.threat_level] || 'default'}
                              size="small"
                              sx={{ fontWeight: 'bold' }}
                            />
                            <Typography variant="caption" color="text.secondary">
                              Confidence: {r.confidence != null
                                ? `${r.confidence > 1 ? r.confidence.toFixed(0) : (r.confidence * 100).toFixed(0)}%`
                                : '—'}
                            </Typography>
                          </Stack>
                          <Typography variant="caption" color="text.primary" sx={{ lineHeight: 1.5, display: 'block' }}>
                            <b>👁 Scene:</b> {r.description}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.5, display: 'block' }}>
                            <b>📋 Recommendation:</b> {r.recommendation}
                          </Typography>
                        </Stack>
                      );
                    })()}
                  </Box>
                </Collapse>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {/* Pagination Controls */}
      {pageCount > 1 && (
        <Box display="flex" justifyContent="center" mt={4} mb={2}>
          <Pagination
            count={pageCount}
            page={page}
            onChange={(e, v) => setPage(v)}
            color="primary"
            size="large"
          />
        </Box>
      )}
    </Box>
  );
};

export default CameraAnomalies;