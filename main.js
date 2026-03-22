import { io } from "socket.io-client";

const API_URL = "http://10.92.166.243:5000";
const socket = io(API_URL);

// Load tags
async function loadTags() {
  const res = await fetch(`${API_URL}/api/tags`);
  const tags = await res.json();
  const container = document.getElementById("tag-list");
  container.innerHTML = "";
  tags.forEach(t => {
    const div = document.createElement("div");
    div.textContent = `${t.tag_id} — ${t.name}`;
    container.appendChild(div);
  });
}

// Load logs
async function loadLogs() {
  const res = await fetch(`${API_URL}/api/logs`);
  const logs = await res.json();
  const container = document.getElementById("log-list");
  container.innerHTML = "";
  logs.forEach(l => {
    const div = document.createElement("div");
    div.textContent = `${l.timestamp} | ${l.tag_id} (${l.name}) → ${l.authorized ? "✅" : "❌"}`;
    container.appendChild(div);
  });
}

// Add new tag
document.getElementById("add-tag-btn").addEventListener("click", async () => {
  const tagId = document.getElementById("tag-id").value;
  const name = document.getElementById("tag-name").value;
  if (!tagId) return alert("Enter tag ID");
  await fetch(`${API_URL}/api/tags`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tag_id: tagId, name })
  });
  loadTags();
});

// Socket listeners
socket.on("log_update", loadLogs);
socket.on("tag_update", loadTags);

// Initial load
loadTags();
loadLogs();
