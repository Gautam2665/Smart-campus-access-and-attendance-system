import {
  Box,
  Typography,
  Chip,
  Switch,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import { useEffect, useState } from "react";
import api from "../../api";
import Header from "../../components/Header";


const API_BASE = "https://college-attendance-api-h7audmhshuhecqg5.centralindia-01.azurewebsites.net";

const Tags = () => {
  const [rows, setRows] = useState([]);

  // ✅ DIALOG STATES
  const [openDialog, setOpenDialog] = useState(false);
  const [dialogType, setDialogType] = useState(''); // 'delete' | 'toggle-error'
  const [currentRow, setCurrentRow] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    try {
      const res = await api.get(`${API_BASE}/api/tags`, { timeout: 10000 });

      const normalized = res.data.map((tag) => ({
        ...tag,
        is_active: tag.is_active === 1 || tag.is_active === true,
      }));

      setRows(normalized);
    } catch (err) {
      console.error("❌ Load failed:", err.message);
      setRows([]);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // 🔘 Toggle ACTIVE / DISABLED
  // 🔘 Toggle ACTIVE / DISABLED
  const toggleActive = async (id, currentStatus) => {
    const newStatus = !currentStatus;

    // 1. Optimistic Update: Flip the switch in the UI immediately
    setRows((prevRows) =>
      prevRows.map((row) =>
        row.id === id ? { ...row, is_active: newStatus } : row
      )
    );

    try {
      setLoading(true);
      // 2. Corrected: Send the new status in the request body
      await api.put(
        `${API_BASE}/api/tags/toggle/${id}`,
        { is_active: newStatus }, // Pass the data here
        { timeout: 8000 }
      );
      // 3. Refresh data to ensure local state matches server
      loadData();
    } catch (err) {
      console.error("❌ Toggle failed:", err.message);
      // 4. Revert UI if the server request fails
      setRows((prevRows) =>
        prevRows.map((row) =>
          row.id === id ? { ...row, is_active: currentStatus } : row
        )
      );
      setDialogType('toggle-error');
      setOpenDialog(true);
    } finally {
      setLoading(false);
    }
  };

  // 🗑 Delete NFC tag
  const deleteTag = async (id, name) => {
    setCurrentRow({ id, name });
    setDialogType('delete');
    setOpenDialog(true);
  };

  // ✅ CONFIRM DELETE
  const confirmDelete = async () => {
    try {
      setLoading(true);
      await api.delete(`${API_BASE}/api/tags/${currentRow.id}`, { timeout: 8000 });
      loadData();
      setOpenDialog(false);
    } catch (err) {
      setDialogType('delete-error');
      setOpenDialog(true);
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    { field: "id", headerName: "ID", width: 80 },
    { field: "tag_id", headerName: "NFC Tag ID", width: 160 },
    { field: "name", headerName: "User Name", width: 150 },

    // 🟢 NFC Status
    {
      field: "nfc_status",
      headerName: "NFC Status",
      width: 140,
      renderCell: ({ row }) => (
        <Chip
          label="REGISTERED"
          color="success"
          size="small"
        />
      ),
    },

    // 🚦 Status badge
    {
      field: "status",
      headerName: "Status",
      width: 120,
      renderCell: ({ row }) => (
        row.is_active ? (
          <Chip label="ACTIVE" color="success" size="small" />
        ) : (
          <Chip label="DISABLED" color="error" size="small" />
        )
      ),
    },

    // 🔐 Switch toggle
    {
      field: "access",
      headerName: "Access",
      width: 90,
      renderCell: ({ row }) => (
        <Switch
          checked={row.is_active === true}
          onChange={() => toggleActive(row.id, row.is_active)}
          size="small"
          color="primary"
          disabled={loading}
        />
      ),
    },

    // 🗑 Delete only
    {
      field: "actions",
      headerName: "Actions",
      width: 140,
      sortable: false,
      renderCell: ({ row }) => (
        <Button
          size="small"
          color="error"
          variant="outlined"
          onClick={() => deleteTag(row.id, row.name)}
          disabled={!row.tag_id || loading}
          sx={{
            textTransform: 'none',
            minWidth: 80,
            height: 32,
            fontSize: '0.75rem'
          }}
        >
          Delete
        </Button>
      ),
    },
  ];

  return (
    <>
      <Box p={4}>
        <Header
          title="REGISTERED NFC TAGS"
        />

        <Box mt={3}>
          <DataGrid
            autoHeight
            rows={rows}
            columns={columns}
            getRowId={(row) => row.id}
            pageSize={10}
            rowsPerPageOptions={[10, 25, 50]}
            disableRowSelectionOnClick
            disableColumnMenu
            loading={loading}
            sx={{
              borderRadius: "12px",
              border: "1px solid #e0e0e0",
              '& .MuiDataGrid-cell': {
                borderBottom: '1px solid #f0f0f0',
              },
              '& .MuiDataGrid-row:hover': {
                bgcolor: '#f5f5f5',
              },
            }}
          />
        </Box>
      </Box>

      {/* ✅ DELETE CONFIRM DIALOG */}
      <Dialog open={openDialog && dialogType === 'delete'} onClose={() => setOpenDialog(false)}>
        <DialogTitle sx={{ color: 'error.main' }}>
          Delete NFC Tag
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete NFC tag for <strong>{currentRow?.name}</strong>?
            <br />This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={confirmDelete}
            color="error"
            variant="contained"
            disabled={loading}
          >
            {loading ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ✅ ERROR DIALOGS */}
      <Dialog open={openDialog && dialogType === 'toggle-error'} onClose={() => setOpenDialog(false)}>
        <DialogTitle sx={{ color: 'warning.main' }}>Toggle Failed</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Failed to update access status. Please check Azure logs and try again.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openDialog && dialogType === 'delete-error'} onClose={() => setOpenDialog(false)}>
        <DialogTitle sx={{ color: 'error.main' }}>Delete Failed</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Failed to delete NFC tag. Please check Azure logs and try again.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default Tags;
