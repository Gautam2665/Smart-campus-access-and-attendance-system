import {
  Box, Typography, Chip, Switch, Button, Card, Stack,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions,
  IconButton, Tooltip
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import { useEffect, useState, useCallback } from "react";
import api from "../../../api";
import Header from "../../../components/Header";
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import FingerprintIcon from '@mui/icons-material/Fingerprint';

const API_BASE = "https://college-attendance-api-h7audmhshuhecqg5.centralindia-01.azurewebsites.net";
const PI_LOCAL_URL = "http://10.78.58.243:5000";

const FingerprintEmployees = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  // Dialog states
  const [openRevokeDialog, setOpenRevokeDialog] = useState(false);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`${API_BASE}/api/fingerprint/employees`);
      const normalized = res.data.map(emp => ({
        ...emp,
        id: emp.emp_id,
        is_active: emp.is_active === 1 || emp.is_active === true
      }));
      setRows(normalized);
    } catch (err) {
      console.error("❌ Azure Fetch Error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // --- ACTION 1: SOFT REVOKE (Hardware wipe + DB NULL) ---
  const handleRevokeConfirm = async () => {
    setLoading(true);
    try {
      if (selectedEmp.finger_id) {
        try {
          await api.delete(`${PI_LOCAL_URL}/api/fingerprint/delete/${selectedEmp.finger_id}`);
        } catch (e) { console.warn("Hardware already clear"); }
      }
      await api.post(`${API_BASE}/api/fingerprint/clear_slot`, { emp_id: selectedEmp.emp_id });
      setOpenRevokeDialog(false);
      loadData();
    } catch (err) {
      alert("Cloud error during revoke.");
    } finally {
      setLoading(false);
    }
  };

  // --- ACTION 2: HARD DELETE (Hardware wipe + DB REMOVE) ---
  const handleDeleteConfirm = async () => {
    setLoading(true);
    try {
      if (selectedEmp.finger_id) {
        try {
          await api.delete(`${PI_LOCAL_URL}/api/fingerprint/delete/${selectedEmp.finger_id}`);
        } catch (e) { console.warn("Hardware already clear"); }
      }
      await api.post(`${API_BASE}/api/fingerprint/delete`, { emp_id: selectedEmp.emp_id });
      setOpenDeleteDialog(false);
      loadData();
    } catch (err) {
      alert("Cloud error during deletion.");
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    { field: "emp_id", headerName: "Emp ID", width: 100 },
    { field: "name", headerName: "Faculty Name", width: 200 },
    { field: "role", headerName: "Role", width: 130 },
    {
      field: "enrollment",
      headerName: "Biometric",
      width: 120,
      renderCell: ({ row }) => (
        <Chip
          label={row.finger_id ? "ENROLLED" : "EMPTY"}
          color={row.finger_id ? "success" : "default"}
          size="small"
        />
      ),
    },
    {
      field: "actions",
      headerName: "Management Actions",
      width: 250,
      renderCell: ({ row }) => (
        <Stack direction="row" spacing={1}>
          <Tooltip title="Revoke Fingerprint Only">
            <span>
              <Button
                size="small" variant="outlined" color="warning" startIcon={<FingerprintIcon />}
                onClick={() => { setSelectedEmp(row); setOpenRevokeDialog(true); }}
                disabled={!row.finger_id || loading}
              > Revoke </Button>
            </span>
          </Tooltip>

          <Tooltip title="Delete User Permanently">
            <IconButton
              color="error"
              onClick={() => { setSelectedEmp(row); setOpenDeleteDialog(true); }}
              disabled={loading}
            >
              <DeleteForeverIcon />
            </IconButton>
          </Tooltip>
        </Stack>
      ),
    },
  ];

  return (
    <Box p={4}>
      <Header title="FACULTY BIOMETRIC MANAGEMENT" subtitle="Revoke access or remove staff records" />

      <Card sx={{ p: 2, mb: 3 }}>
        <Button variant="contained" onClick={loadData} disabled={loading}>Refresh Data</Button>
      </Card>

      <DataGrid rows={rows} columns={columns} autoHeight loading={loading} disableRowSelectionOnClick />

      {/* Revoke Dialog */}
      <Dialog open={openRevokeDialog} onClose={() => setOpenRevokeDialog(false)}>
        <DialogTitle>Revoke Biometric?</DialogTitle>
        <DialogContent>
          <DialogContentText>This clears the sensor slot for <b>{selectedEmp?.name}</b> but keeps their profile.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenRevokeDialog(false)}>Cancel</Button>
          <Button onClick={handleRevokeConfirm} color="warning" variant="contained">Confirm Revoke</Button>
        </DialogActions>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={openDeleteDialog} onClose={() => setOpenDeleteDialog(false)}>
        <DialogTitle>Permanent Delete?</DialogTitle>
        <DialogContent>
          <DialogContentText>This removes <b>{selectedEmp?.name}</b> from the system entirely. <b>Cannot be undone.</b></DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDeleteDialog(false)}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">Hard Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default FingerprintEmployees;