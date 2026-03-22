
import { Box, Button, TextField, useTheme, IconButton, Tooltip, Dialog, DialogTitle, DialogContent, DialogActions, Chip, Stack } from "@mui/material";
import { DataGrid, GridToolbarContainer, GridToolbarFilterButton } from "@mui/x-data-grid";
import { tokens } from "../../theme"; // Importing tokens object directly
import Header from "../../components/Header";
import { useState, useEffect } from "react";
import api from "../../api";
import { API_BASE_URL } from "../../config";
import {
    Delete as DeleteIcon,
    Edit as EditIcon,
    Add as AddIcon,
    Router as RouterIcon,
    Refresh as RefreshIcon
} from "@mui/icons-material";

const DeviceManager = () => {
    // 🎨 Theme & Colors (Using only available tokens)
    const colors = tokens;
    const [devices, setDevices] = useState([]);
    const [openDialog, setOpenDialog] = useState(false);
    const [editingDevice, setEditingDevice] = useState(null);
    const [formData, setFormData] = useState({ device_id: "", name: "", location_id: "" });

    useEffect(() => {
        fetchDevices();
    }, []);

    const fetchDevices = async () => {
        try {
            const res = await api.get(`${API_BASE_URL}/api/devices`);
            setDevices(res.data);
        } catch (err) {
            console.error("Error fetching devices:", err);
        }
    };

    const handleSave = async () => {
        try {
            const payload = {
                device_id: formData.device_id.trim(),
                name: formData.name.trim(),
                location_id: formData.location_id.trim()
            };

            if (!payload.device_id || !payload.name) {
                alert("Device ID and Name are required!");
                return;
            }

            await api.post(`${API_BASE_URL}/api/devices`, payload);
            fetchDevices();
            handleCloseDialog();
        } catch (err) {
            console.error("Error saving device:", err);
            alert("Failed to save device.");
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm(`Are you sure you want to delete device ${id}?`)) return;
        try {
            await api.delete(`${API_BASE_URL}/api/devices/${id}`);
            setDevices((prev) => prev.filter((d) => d.device_id !== id));
        } catch (err) {
            console.error("Error deleting device:", err);
            alert("Failed to delete device.");
        }
    };

    const handleOpenDialog = (device = null) => {
        if (device) {
            setEditingDevice(device);
            setFormData({
                device_id: device.device_id,
                name: device.name,
                location_id: device.location_id
            });
        } else {
            setEditingDevice(null);
            setFormData({ device_id: "", name: "", location_id: "" });
        }
        setOpenDialog(true);
    };

    const handleCloseDialog = () => {
        setOpenDialog(false);
        setEditingDevice(null);
    };

    // 🗓️ Robust Date Formatter
    const formatDate = (dateString) => {
        if (!dateString) return "Never";
        try {
            const date = new Date(dateString.replace(' ', 'T'));
            if (isNaN(date.getTime())) return dateString;
            return date.toLocaleString("en-IN", {
                day: 'numeric', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
        } catch (e) {
            return dateString;
        }
    };

    const columns = [
        {
            field: "device_id",
            headerName: "Device ID (MAC)",
            flex: 1,
            renderCell: ({ value }) => (
                <Stack direction="row" alignItems="center" spacing={1}>
                    <RouterIcon fontSize="small" sx={{ color: colors.primary[500] }} />
                    <span style={{ fontWeight: 'bold' }}>{value}</span>
                </Stack>
            )
        },
        { field: "name", headerName: "Friendly Name", flex: 1 },
        {
            field: "location_id",
            headerName: "Assigned Location",
            flex: 1,
            renderCell: ({ value }) => (
                <Chip label={value || "Unassigned"} size="small" variant="outlined" />
            )
        },
        {
            field: "last_seen",
            headerName: "Last Heartbeat",
            flex: 1,
            renderCell: ({ value }) => formatDate(value)
        },
        {
            field: "actions",
            headerName: "Actions",
            flex: 0.8,
            renderCell: (params) => (
                <Box>
                    <Tooltip title="Edit Device">
                        <IconButton onClick={() => handleOpenDialog(params.row)} color="info">
                            <EditIcon />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete Device">
                        <IconButton onClick={() => handleDelete(params.row.device_id)} color="error">
                            <DeleteIcon />
                        </IconButton>
                    </Tooltip>
                </Box>
            ),
        },
    ];

    const CustomToolbar = () => {
        return (
            <GridToolbarContainer sx={{ p: 2, justifyContent: 'space-between' }}>
                <Box>
                    <GridToolbarFilterButton />
                </Box>
                <Button
                    variant="contained"
                    // Use literal color for secondary since theme might lack specifics
                    sx={{ bgcolor: colors.greenAccent[500], fontWeight: 'bold', color: 'white' }}
                    startIcon={<AddIcon />}
                    onClick={() => handleOpenDialog()}
                >
                    ADD DEVICE
                </Button>
            </GridToolbarContainer>
        );
    }

    return (
        <Box m="20px">
            <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Header title="DEVICE COMMAND CENTER" subtitle="Control IoT Nodes & Locations" />
                <Button startIcon={<RefreshIcon />} onClick={fetchDevices} variant="outlined">
                    Refresh Status
                </Button>
            </Stack>

            <Box
                m="20px 0 0 0"
                height="75vh"
                sx={{
                    // Use safer colors from tokens or fallbacks
                    "& .MuiDataGrid-root": { border: "none", boxShadow: 3, borderRadius: 2, bgcolor: "#fff" },
                    "& .MuiDataGrid-cell": { borderBottom: "1px solid " + colors.grey[100] },
                    // Color changed to #000 for visibility
                    "& .MuiDataGrid-columnHeaders": { backgroundColor: colors.primary[900], borderBottom: "none", color: "#000", fontSize: "1rem" },
                    "& .MuiDataGrid-virtualScroller": { backgroundColor: colors.grey[100] },
                    "& .MuiDataGrid-footerContainer": { borderTop: "none", backgroundColor: colors.primary[900], color: "#fff" },
                    "& .MuiCheckbox-root": { color: colors.greenAccent[500] + " !important" },
                    "& .MuiIconButton-root": { color: colors.grey[500] }
                }}
            >
                <DataGrid
                    rows={devices}
                    columns={columns}
                    getRowId={(row) => row.device_id}
                    components={{ Toolbar: CustomToolbar }}
                    disableSelectionOnClick
                />
            </Box>

            {/* ADD / EDIT DIALOG */}
            <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ bgcolor: colors.primary[900], color: 'white', fontWeight: 'bold' }}>
                    {editingDevice ? "EDIT DEVICE" : "REGISTER NEW DEVICE"}
                </DialogTitle>
                <DialogContent sx={{ mt: 2, pt: 3 }}>
                    <Stack spacing={3} sx={{ mt: 1 }}>
                        <TextField
                            label="Device ID (MAC Address)"
                            fullWidth
                            variant="outlined"
                            value={formData.device_id}
                            onChange={(e) => setFormData({ ...formData, device_id: e.target.value })}
                            disabled={!!editingDevice}
                            helperText={editingDevice ? "Device ID acts as the unique key and cannot be changed." : "Enter the MAC address or Unique ID of the IoT node."}
                        />
                        <TextField
                            label="Friendly Name"
                            fullWidth
                            variant="outlined"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            placeholder="e.g. Main Gate Pi"
                        />
                        <TextField
                            label="Assigned Location"
                            fullWidth
                            variant="outlined"
                            value={formData.location_id}
                            onChange={(e) => setFormData({ ...formData, location_id: e.target.value.toUpperCase() })}
                            placeholder="e.g. GATE_A, LAB_1"
                            helperText="Location ID links this device to security zones."
                        />
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button onClick={handleCloseDialog} color="inherit" variant="text">CANCEL</Button>
                    <Button onClick={handleSave} variant="contained" size="large" sx={{ bgcolor: colors.greenAccent[500], fontWeight: 'bold', px: 4, color: 'white' }}>
                        {editingDevice ? "UPDATE" : "REGISTER"}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default DeviceManager;
