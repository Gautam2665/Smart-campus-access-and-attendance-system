import React, { useState, useEffect } from 'react';
import {
  Box,
  IconButton,
  useTheme,
  Badge,
  Menu,
  MenuItem,
  Typography,
  Divider,
  Stack,
  Tooltip // 👈 ADD THIS
} from '@mui/material';
import { tokens } from '../../theme';
import { AuthenticatedTemplate, UnauthenticatedTemplate } from "@azure/msal-react";
import { SignInButton, SignOutButton } from "../../components/AuthButtons";
import InputBase from '@mui/material/InputBase';
import SearchIcon from '@mui/icons-material/Search';
import NotificationsOutlinedIcon from '@mui/icons-material/NotificationsOutlined';
import WarningIcon from '@mui/icons-material/Warning';
import { formatDistanceToNow } from 'date-fns';
import { Link } from 'react-router-dom';
import api from '../../api';

const Topbar = () => {
  const theme = useTheme();
  const colors = tokens;

  // ─── Notification State ───
  const [anchorEl, setAnchorEl] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const openPopup = Boolean(anchorEl);

  const handleNotificationClick = (event) => {
    setAnchorEl(event.currentTarget);
    setUnreadCount(0); // Clear badge on open
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  // Poll for recent anomalies (unauthorized or severe)
  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const res = await api.get('/attendance');
        const data = res.data;
        if (!Array.isArray(data)) return;

        // Filter: Unauthorized OR explicitly flagged anomaly, from the last 24 hours
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const alerts = data.filter(log => {
          const isAnomaly = !log.authorized || log.verification_type === 'CAMERA_ANOMALY';
          return isAnomaly && new Date(log.timestamp) > oneDayAgo;
        }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        setNotifications(alerts.slice(0, 10)); // Keep top 10

        // If we have new alerts we haven't seen since the dropdown was last closed
        if (!anchorEl && alerts.length > notifications.length) {
          setUnreadCount(alerts.length);
        }
      } catch (err) {
        console.error("Failed to fetch notifications", err);
      }
    };

    fetchAlerts();
    const interval = setInterval(fetchAlerts, 15000); // poll every 15s
    return () => clearInterval(interval);
  }, []);

  return (
    <Box display="flex" justifyContent="space-between" p={2} sx={{ backgroundColor: colors.grey[100] }}>
      {/* SEARCH BAR */}
      <Box
        display="flex"
        backgroundColor={theme.palette.background.paper}
        borderRadius="3px"
      >
        <InputBase sx={{ ml: 2, flex: 1 }} placeholder="Search" />
        <IconButton type="button" sx={{ p: 1 }}>
          <SearchIcon />
        </IconButton>
      </Box>

      {/* ICONS & AUTH */}
      <Box display="flex" alignItems="center" gap={2}>
        <AuthenticatedTemplate>
          <Tooltip title="Notifications">
            <IconButton onClick={handleNotificationClick}>
              <Badge badgeContent={unreadCount} color="error" variant="dot">
                <NotificationsOutlinedIcon />
              </Badge>
            </IconButton>
          </Tooltip>

          {/* NOTIFICATION S TRAY */}
          <Menu
            anchorEl={anchorEl}
            open={openPopup}
            onClose={handleClose}
            PaperProps={{
              sx: {
                mt: 1.5,
                width: 320,
                maxHeight: 400,
                borderRadius: 2,
                boxShadow: theme.shadows[8]
              }
            }}
            transformOrigin={{ horizontal: 'right', vertical: 'top' }}
            anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
          >
            <Box sx={{ px: 2, py: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="subtitle1" fontWeight="bold">Security Alerts</Typography>
              <Typography variant="caption" color="text.secondary">{notifications.length} recent</Typography>
            </Box>
            <Divider />

            {notifications.length === 0 ? (
              <Box sx={{ p: 3, textAlign: 'center' }}>
                <NotificationsOutlinedIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                <Typography variant="body2" color="text.secondary">All clear. No recent threats.</Typography>
              </Box>
            ) : (
              notifications.map((alert) => (
                <MenuItem
                  key={alert.id}
                  onClick={handleClose}
                  component={Link}
                  to={alert.verification_type === 'CAMERA_ANOMALY' ? '/camera-anomalies' : '/attendance'}
                  sx={{ py: 1.5, px: 2, borderBottom: '1px solid', borderColor: 'divider', '&:last-child': { borderBottom: 0 } }}
                >
                  <Stack direction="row" spacing={1.5} alignItems="flex-start">
                    <WarningIcon color="error" fontSize="small" sx={{ mt: 0.3 }} />
                    <Box>
                      <Typography variant="body2" fontWeight="bold" color="text.primary">
                        {alert.verification_type?.replace('_', ' ')}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block" noWrap sx={{ width: 230 }}>
                        {alert.name} — {alert.status || 'DENIED'}
                      </Typography>
                      <Typography variant="caption" color="primary.main" fontWeight={500}>
                        {formatDistanceToNow(new Date(alert.timestamp), { addSuffix: true })}
                      </Typography>
                    </Box>
                  </Stack>
                </MenuItem>
              ))
            )}
            <Divider />
            <Box sx={{ p: 1, textAlign: 'center' }}>
              <Typography
                component={Link}
                to="/attendance"
                variant="caption"
                onClick={handleClose}
                sx={{ color: 'primary.main', textDecoration: 'none', fontWeight: 'bold', '&:hover': { textDecoration: 'underline' } }}
              >
                View all logs
              </Typography>
            </Box>
          </Menu>

          <SignOutButton />
        </AuthenticatedTemplate>
        <UnauthenticatedTemplate>
          <SignInButton />
        </UnauthenticatedTemplate>
      </Box>
    </Box>
  );
};

export default Topbar;