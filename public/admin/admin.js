const API_BASE = "/api/admin";

let isAuthenticated = false;

async function checkSession() {
  try {
    const response = await fetch(`${API_BASE}/content?collection=games&page=1`, {
      credentials: "include",
    });
    if (response.ok) {
      isAuthenticated = true;
      initPanel();
    } else {
      window.location.href = "/admin/";
    }
  } catch {
    window.location.href = "/admin/";
  }
}

function initPanel() {
  window.location.href = "/admin/panel.html";
  // Aquí se agregan las secciones del panel: listado de contenido, editor, subida de medios, etc.
}

async function logout() {
  try {
    await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
  } finally {
    window.location.href = "/admin/";
  }
}

document.addEventListener("DOMContentLoaded", checkSession);

window.AdminPanel = {
  isAuthenticated: () => isAuthenticated,
  logout,
};
