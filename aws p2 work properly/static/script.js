// Navbar toggle (mobile)
const navToggle = document.getElementById("navToggle");
const navLinks = document.getElementById("navLinks");
if (navToggle && navLinks) {
  navToggle.addEventListener("click", () => {
    navLinks.classList.toggle("show");
  });
}

// Password toggle
const togglePass = document.getElementById("togglePass");
const passwordInput = document.getElementById("passwordInput");
if (togglePass && passwordInput) {
  togglePass.addEventListener("click", () => {
    const isHidden = passwordInput.type === "password";
    passwordInput.type = isHidden ? "text" : "password";
    togglePass.textContent = isHidden ? "Hide" : "Show";
  });
}

// Sidebar toggle (mobile)
const sideToggle = document.getElementById("sideToggle");
const sidebar = document.getElementById("sidebar");
if (sideToggle && sidebar) {
  sideToggle.addEventListener("click", () => {
    sidebar.classList.toggle("open");
  });
}

// Tabs
const tabButtons = document.querySelectorAll(".side-link[data-tab]");
const tabs = document.querySelectorAll(".tab");

tabButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    tabButtons.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    const target = btn.getAttribute("data-tab");
    tabs.forEach(t => t.classList.remove("active"));
    const activeTab = document.getElementById(target);
    if (activeTab) activeTab.classList.add("active");

    // close sidebar on mobile after click
    if (sidebar) sidebar.classList.remove("open");
  });
});

// Keep the active form section visually highlighted while the user is editing it.
const sections = document.querySelectorAll(".form-section input, .form-section select");

sections.forEach(field => {
  field.addEventListener("focus", () => {
    document.querySelectorAll(".form-section").forEach(sec => sec.classList.remove("active-section"));
    const parentSection = field.closest(".form-section");
    if (parentSection) parentSection.classList.add("active-section");
  });
});
