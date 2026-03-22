import React, { useState, useEffect, useCallback } from "react";
import {
  Box, TextField, Button, Typography, Alert, Paper,
  CircularProgress, Stack, Divider, MenuItem, Select,
  FormControl, InputLabel
} from "@mui/material";
import FingerprintIcon from "@mui/icons-material/Fingerprint";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import api from "../../../api";

// Ensure this matches your Raspberry Pi's current IP
const PI_API = "http://10.78.58.243:5000";

export default function FacultyEnrollment() {
  const [loadingEnroll, setLoadingEnroll] = useState(false);
  const [status, setStatus] = useState(null);
  const [departments, setDepartments] = useState([]);

  const [form, setForm] = useState({
    emp_id: "",
    name: "",
    role: "Faculty",
    department: "",
    finger_id: "",
  });

  // Fetch departments from the Azure master list
  const fetchDepartments = useCallback(async () => {
    try {
      const res = await api.get("/departments");
      setDepartments(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      console.warn("⚠️ Could not load departments from cloud:", e);
    }
  }, []);

  useEffect(() => {
    fetchDepartments();
  }, [fetchDepartments]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const startEnroll = async () => {
    // Validation for strict departmental logging
    if (!form.emp_id || !form.name || !form.finger_id || !form.department) {
      setStatus({ type: "error", msg: "Please fill in all fields including Department." });
      return;
    }

    setLoadingEnroll(true);
    setStatus({
      type: "info",
      msg: "Pi Station Active: Please place your finger on the sensor when the light blinks.",
    });

    try {
      const payload = {
        emp_id: form.emp_id,
        finger_id: Number(form.finger_id),
        name: form.name.trim(),
        role: form.role.trim(),
        department: form.department, 
      };

      // Long timeout to allow for the physical double-scan on the AS608
      await api.post(`${PI_API}/api/fingerprint/enroll`, payload, { timeout: 80000 });

      setStatus({ type: "success", msg: `Successfully enrolled ${form.name} in Slot ${form.finger_id}!` });
      setForm({ emp_id: "", name: "", role: "Faculty", department: "", finger_id: "" });
    } catch (err) {
      console.error("Enrollment failed:", err);
      const errorMsg = err.response?.data?.error || "Connection to Pi lost or scan timed out.";
      setStatus({ type: "error", msg: errorMsg });
    } finally {
      setLoadingEnroll(false);
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, display: "flex", justifyContent: "center", flexDirection: "column", alignItems: "center", gap: 3 }}>

      {/* ── ENROLLMENT FORM ── */}
      <Paper elevation={6} sx={{ p: 4, borderRadius: 4, maxWidth: 500, width: "100%", border: "1px solid", borderColor: "divider" }}>
        <Stack direction="row" spacing={2} alignItems="center" mb={3}>
          <FingerprintIcon color="primary" sx={{ fontSize: 45 }} />
          <Box>
            <Typography variant="h5" fontWeight="bold">New Enrollment</Typography>
            <Typography variant="body2" color="text.secondary">Register hardware biometrics to Cloud</Typography>
          </Box>
        </Stack>

        <Divider sx={{ mb: 3 }} />

        <Stack spacing={2.5}>
          <Stack direction="row" spacing={2}>
            <TextField
              fullWidth
              label="Employee ID"
              name="emp_id"
              placeholder="e.g. EMP101"
              value={form.emp_id}
              onChange={handleChange}
            />
            <TextField
              sx={{ width: "160px" }}
              label="Sensor Slot"
              name="finger_id"
              type="number"
              placeholder="1-127"
              value={form.finger_id}
              onChange={handleChange}
            />
          </Stack>

          <TextField fullWidth label="Full Name" name="name" value={form.name} onChange={handleChange} />

          <TextField fullWidth label="Designation/Role" name="role" value={form.role} onChange={handleChange} />

          {/* ── DEPARTMENT DROPDOWN ── */}
          <FormControl fullWidth>
            <InputLabel>Department</InputLabel>
            <Select
              name="department"
              value={form.department}
              label="Department"
              onChange={handleChange}
            >
              {departments.length === 0 ? (
                <MenuItem disabled value="">No departments found in Cloud</MenuItem>
              ) : (
                departments.map((dept, index) => (
                  // ✅ FIX: Use dept.name for the display text, not just 'dept'
                  <MenuItem key={dept.id || index} value={dept.name}>
                    {dept.name} 
                  </MenuItem>
                ))
              )}
            </Select>
          </FormControl>

          <Box sx={{ pt: 1 }}>
            <Button
              variant="contained"
              fullWidth
              size="large"
              disabled={loadingEnroll}
              onClick={startEnroll}
              startIcon={loadingEnroll ? <CircularProgress size={22} color="inherit" /> : <PersonAddIcon />}
              sx={{ py: 1.5, fontWeight: "bold", borderRadius: 2 }}
            >
              {loadingEnroll ? "Scan Finger Twice..." : "Start Physical Scan"}
            </Button>
          </Box>

          {status && (
            <Alert severity={status.type} variant="outlined" onClose={() => setStatus(null)} sx={{ borderRadius: 2, fontWeight: 500 }}>
              {status.msg}
            </Alert>
          )}
        </Stack>

        <Box sx={{ mt: 4, textAlign: "center" }}>
          <Typography variant="caption" color="text.secondary">
            Note: Enrollment requires two successful scans on the physical sensor.
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
}