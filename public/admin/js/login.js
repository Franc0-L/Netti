const form = document.getElementById("login-form");
const error = document.getElementById("error");
const passwordInput = document.getElementById("password");
const submitButton = form?.querySelector('button[type="submit"]');

if (form && error && passwordInput && submitButton) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.style.display = "none";
    submitButton.disabled = true;

    try {
      const response = await fetch(form.action, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "login",
          password: passwordInput.value,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data.ok) {
        window.location.assign("/admin/");
        return;
      }

      error.textContent =
        data.error || "No se pudo iniciar sesión. Intentá de nuevo.";
      error.style.display = "block";
    } catch {
      error.textContent =
        "No se pudo conectar con el servidor. Revisá tu conexión e intentá de nuevo.";
      error.style.display = "block";
    } finally {
      submitButton.disabled = false;
    }
  });
}
