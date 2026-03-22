import {
  Sidebar,
  SidebarItems,
  SidebarItem,
  SidebarItemGroup,
  SidebarCollapse
} from "flowbite-react";
import {
  HiChartPie,
  HiTable,
  HiOutlineTag,
  HiUserAdd,
  HiCreditCard,
  HiFingerPrint,
  HiCamera,
  HiUsers,
  HiChip,
  HiOfficeBuilding,
  HiLightBulb,
  HiShieldCheck,
  HiChartBar,
  HiLightningBolt,
  HiShieldExclamation
} from "react-icons/hi";
import { useLocation, Link } from "react-router-dom";
import { motion } from "framer-motion";

// 🔹 Section label
const SectionLabel = ({ children }) => (
  <div className="uppercase tracking-[0.15em] text-[11px] font-semibold text-gray-400 mt-10 mb-4 pl-8 font-poppins opacity-80">
    {children}
  </div>
);

import { useAuth } from "../../context/AuthContext";

// 🔹 User profile card
const CustomUserProfile = () => {
  const { user, loading } = useAuth();

  if (loading) return null; // Or a skeleton

  const name = user?.name || "Guest";
  const role = user?.role || "Viewer";
  const source = user?.source === 'database' ? '🏢' : '☁️';

  // Use a span with a title for the source
  return (
    <div
      className="flex items-center space-x-5 py-7 px-7 bg-gradient-to-r from-indigo-700 via-indigo-800 to-indigo-900 rounded-2xl shadow-lg hover:shadow-2xl mx-6 mb-10 font-poppins"
    >
      <img
        className="w-14 h-14 rounded-full border-[3px] border-indigo-400 shadow-md"
        src={`https://api.dicebear.com/7.x/initials/svg?seed=${name}`}
        alt="User avatar"
      />
      <div>
        <div className="font-semibold text-white text-lg mb-[2px] truncate w-24" title={name}>{name.split(" ")[0]}</div>
        <div className="text-xs text-indigo-200 tracking-wide uppercase flex items-center gap-1">
          {role}
          <span title={source === '🏢' ? 'Managed Role' : 'Azure Role'} style={{ fontSize: '1.2em' }}>
            {source}
          </span>
        </div>
      </div>
    </div>
  );
};

// ... (imports remain the same)

const AppSidebar = () => {
  const location = useLocation();
  const { hasPermission } = useAuth();
  const isActive = (path) => location.pathname === path;

  const isNfcActive =
    isActive("/logs") || isActive("/tags") || isActive("/form") || isActive("/attendance");

  // New state check for Camera Anomalies scene
  const isCameraActive = location.pathname.startsWith("/camera-anomalies");

  return (
    <div className="relative h-full font-poppins">
      <div className="absolute inset-0 bg-gradient-to-b from-[#0b1220] via-[#111a2c] to-[#0a0f1a]"></div>

      <Sidebar className="relative z-10 bg-transparent text-white w-80 p-0 flex flex-col border-r border-gray-800 shadow-2xl backdrop-blur-sm h-full">
        <div className="pt-8">
          <CustomUserProfile />
        </div>

        <SidebarItems className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700">
          <SectionLabel>General</SectionLabel>
          <SidebarItemGroup>
            <SidebarItem
              as={Link}
              to="/"
              icon={HiChartPie}
              active={isActive("/")}
              className={`transition-all duration-200 rounded-xl mx-5 mb-3 px-5 py-3 font-medium text-[15px] tracking-wide ${isActive("/")
                ? "bg-indigo-700 text-white shadow-lg"
                : "hover:bg-gray-800 hover:text-indigo-200"
                }`}
            >
              Dashboard
            </SidebarItem>
          </SidebarItemGroup>

          <SectionLabel>Access Control</SectionLabel>
          <SidebarItemGroup>
            {/* NFC Section - Requires LOGS_VIEW or TAGS_MANAGE */}
            {(hasPermission('LOGS_VIEW') || hasPermission('TAGS_MANAGE')) && (
              <SidebarCollapse
                icon={HiCreditCard}
                label="NFC"
                open={isNfcActive}
                className={`transition-all duration-200 rounded-xl mx-5 mb-3 px-5 py-3 font-medium text-[15px] ${isNfcActive
                  ? "bg-indigo-700 text-white shadow-lg"
                  : "hover:bg-gray-800 hover:text-indigo-200"
                  }`}
              >
                {hasPermission('LOGS_VIEW') && (
                  <SidebarItem
                    as={Link}
                    to="/logs"
                    icon={HiTable}
                    active={isActive("/logs")}
                    className={`ml-4 text-[14px] py-2 ${isActive("/logs") ? "text-indigo-300" : "text-gray-300 hover:text-white"}`}
                  >
                    Access Logs
                  </SidebarItem>
                )}

                {hasPermission('TAGS_MANAGE') && (
                  <SidebarItem
                    as={Link}
                    to="/tags"
                    icon={HiOutlineTag}
                    active={isActive("/tags")}
                    className={`ml-4 text-[14px] py-2 ${isActive("/tags") ? "text-indigo-300" : "text-gray-300 hover:text-white"}`}
                  >
                    Authorized Tags
                  </SidebarItem>
                )}

                {hasPermission('TAGS_MANAGE') && (
                  <SidebarItem
                    as={Link}
                    to="/form"
                    icon={HiUserAdd}
                    active={isActive("/form")}
                    className={`ml-4 text-[14px] py-2 ${isActive("/form") ? "text-indigo-300" : "text-gray-300 hover:text-white"}`}
                  >
                    Register Tag
                  </SidebarItem>
                )}

                <SidebarItem
                  as={Link}
                  to="/attendance"
                  icon={HiChartPie}
                  active={isActive("/attendance")}
                  className={`ml-4 text-[14px] py-2 ${isActive("/attendance") ? "text-indigo-300" : "text-gray-300 hover:text-white"}`}
                >
                  Attendance Analysis
                </SidebarItem>
              </SidebarCollapse>
            )}

            {/* Fingerprint Section */}
            {hasPermission('FINGERPRINT_MANAGE') && (
              <SidebarCollapse
                icon={HiFingerPrint}
                label="Fingerprint"
                open={location.pathname.startsWith("/fingerprint")}
                className={`transition-all duration-200 rounded-xl mx-5 mb-3 px-5 py-3 font-medium text-[15px] ${location.pathname.startsWith("/fingerprint")
                  ? "bg-indigo-700 text-white shadow-lg"
                  : "hover:bg-gray-800 hover:text-indigo-200"
                  }`}
              >
                <SidebarItem
                  as={Link}
                  to="/fingerprint/logs"
                  className={`ml-4 text-[14px] py-2 ${isActive("/fingerprint/logs") ? "text-indigo-300" : "text-gray-300 hover:text-white"}`}
                >
                  Logs
                </SidebarItem>
                <SidebarItem
                  as={Link}
                  to="/fingerprint/employees"
                  className={`ml-4 text-[14px] py-2 ${isActive("/fingerprint/employees") ? "text-indigo-300" : "text-gray-300 hover:text-white"}`}
                >
                  Registered Employees
                </SidebarItem>
                <SidebarItem
                  as={Link}
                  to="/fingerprint/enroll"
                  className={`ml-4 text-[14px] py-2 ${isActive("/fingerprint/enroll") ? "text-indigo-300" : "text-gray-300 hover:text-white"}`}
                >
                  Enroll Finger
                </SidebarItem>
                <SidebarItem
                  as={Link}
                  to="/fingerprint/attendance"
                  className={`ml-4 text-[14px] py-2 ${isActive("/fingerprint/attendance") ? "text-indigo-300" : "text-gray-300 hover:text-white"}`}
                >
                  Attendance Analysis
                </SidebarItem>
              </SidebarCollapse>
            )}

            {/* Security Camera Anomalies Section */}
            {hasPermission('CAMERA_VIEW') && (
              <SidebarItem
                as={Link}
                to="/camera-anomalies"
                icon={HiCamera}
                active={isCameraActive}
                className={`transition-all duration-200 rounded-xl mx-5 mb-3 px-5 py-3 font-medium text-[15px] ${isCameraActive
                  ? "bg-red-600 text-white shadow-lg border border-red-500"
                  : "bg-gray-800/30 border border-gray-700/30 hover:bg-red-500/10 hover:text-red-400"
                  }`}
              >
                Camera Anomalies
              </SidebarItem>
            )}

            {hasPermission('USERS_MANAGE') && (
              <SidebarItem
                as={Link}
                to="/users"
                icon={HiUsers}
                active={isActive("/users")}
                className={`transition-all duration-200 rounded-xl mx-5 mb-3 px-5 py-3 font-medium text-[15px] ${isActive("/users")
                  ? "bg-indigo-700 text-white shadow-lg" // Active state
                  : "text-gray-300 hover:bg-gray-800 hover:text-indigo-200" // Inactive but ready
                  }`}
              >
                Users & Roles
              </SidebarItem>
            )}
          </SidebarItemGroup>

          <SectionLabel>System Administration</SectionLabel>
          <SidebarItemGroup>
            {hasPermission('DEVICES_MANAGE') && (
              <SidebarItem
                as={Link}
                to="/devices"
                icon={HiChip}
                active={isActive("/devices")}
                className={`transition-all duration-200 rounded-xl mx-5 mb-3 px-5 py-3 font-medium text-[15px] ${isActive("/devices")
                  ? "bg-indigo-700 text-white shadow-lg"
                  : "hover:bg-gray-800 hover:text-indigo-200"
                  }`}
              >
                Device Manager
              </SidebarItem>
            )}

            {hasPermission('USERS_MANAGE') && (
              <SidebarItem
                as={Link}
                to="/departments"
                icon={HiOfficeBuilding}
                active={isActive("/departments")}
                className={`transition-all duration-200 rounded-xl mx-5 mb-3 px-5 py-3 font-medium text-[15px] ${isActive("/departments")
                  ? "bg-indigo-700 text-white shadow-lg"
                  : "hover:bg-gray-800 hover:text-indigo-200"
                  }`}
              >
                Departments
              </SidebarItem>
            )}
          </SidebarItemGroup>

          <SectionLabel>AI Intelligence</SectionLabel>
          <SidebarItemGroup>
            {hasPermission('LOGS_VIEW') && (
              <SidebarItem
                as={Link}
                to="/ai-chat"
                icon={HiLightBulb}
                active={isActive("/ai-chat")}
                className={`transition-all duration-200 rounded-xl mx-5 mb-3 px-5 py-3 font-medium text-[15px] ${isActive("/ai-chat")
                  ? "bg-indigo-700 text-white shadow-lg"
                  : "hover:bg-gray-800 hover:text-indigo-200"
                  }`}
              >
                AI Chat
              </SidebarItem>
            )}
            {hasPermission('LOGS_VIEW') && (
              <SidebarItem
                as={Link}
                to="/ai-analyst"
                icon={HiShieldCheck}
                active={isActive("/ai-analyst")}
                className={`transition-all duration-200 rounded-xl mx-5 mb-3 px-5 py-3 font-medium text-[15px] ${isActive("/ai-analyst")
                  ? "bg-red-600 text-white shadow-lg"
                  : "hover:bg-gray-800 hover:text-red-400"
                  }`}
              >
                Security Analyst
              </SidebarItem>
            )}
            {hasPermission('LOGS_VIEW') && (
              <SidebarItem
                as={Link}
                to="/ai-risk"
                icon={HiChartBar}
                active={isActive("/ai-risk")}
                className={`transition-all duration-200 rounded-xl mx-5 mb-3 px-5 py-3 font-medium text-[15px] ${isActive("/ai-risk")
                  ? "bg-amber-600 text-white shadow-lg"
                  : "hover:bg-gray-800 hover:text-amber-400"
                  }`}
              >
                Risk Scores
              </SidebarItem>
            )}
            {hasPermission('LOGS_VIEW') && (
              <SidebarItem
                as={Link}
                to="/ai-agent"
                icon={HiLightningBolt}
                active={isActive("/ai-agent")}
                className={`transition-all duration-200 rounded-xl mx-5 mb-3 px-5 py-3 font-medium text-[15px] ${isActive("/ai-agent")
                  ? "bg-indigo-600 text-white shadow-lg"
                  : "hover:bg-gray-800 hover:text-indigo-400"
                  }`}
              >
                Agent Mission
              </SidebarItem>
            )}
            {hasPermission('LOGS_VIEW') && (
              <SidebarItem
                as={Link}
                to="/ai-flags"
                icon={HiShieldExclamation}
                active={isActive("/ai-flags")}
                className={`transition-all duration-200 rounded-xl mx-5 mb-3 px-5 py-3 font-medium text-[15px] ${isActive("/ai-flags")
                  ? "bg-red-600 text-white shadow-lg"
                  : "hover:bg-gray-800 hover:text-red-400"
                  }`}
              >
                AI Flags
              </SidebarItem>
            )}
          </SidebarItemGroup>
        </SidebarItems>
      </Sidebar>
    </div>
  );
};

export default AppSidebar;