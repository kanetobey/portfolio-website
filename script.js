// targeting element from html file for hamburger menu //

function toggleMenu() {
    const menu = document.querySelector(".menu-links");
    const icon = document.querySelector(".hamburger-icon");
    const isOpen = menu.classList.toggle("open");
    icon.classList.toggle("open", isOpen);
    // keep screen readers in sync with what's on screen
    icon.setAttribute("aria-expanded", String(isOpen));
}

// light / dark mode toggle //
// The starting theme is set by the inline script in index.html so the page
// never paints the wrong one first. This only handles clicks after that.

function toggleTheme() {
    const root = document.documentElement;
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    syncThemeColor(next);
}

// keeps the mobile browser chrome matching the page instead of staying cream
function syncThemeColor(theme) {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
        meta.setAttribute("content", theme === "dark" ? "#101413" : "#faf9f6");
    }
}

// Follow the system setting as it changes, until a choice has been saved.

window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", (event) => {
        if (!localStorage.getItem("theme")) {
            const theme = event.matches ? "dark" : "light";
            document.documentElement.setAttribute("data-theme", theme);
            syncThemeColor(theme);
        }
    });

syncThemeColor(document.documentElement.getAttribute("data-theme"));
