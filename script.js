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

// job durations //
// Each span carries its own dates in the HTML (data-span-from / data-span-to),
// so the markup stays the source of truth and the current role keeps counting
// on its own instead of going stale like the old hardcoded "3+ years" did.
// Leaving off data-span-to means "until now".

function formatSpan(from, to) {
    let months =
        (to.getFullYear() - from.getFullYear()) * 12 +
        (to.getMonth() - from.getMonth());

    // A job started on the 30th isn't a month old on the 1st.
    if (to.getDate() < from.getDate()) months--;
    if (months < 0) months = 0;

    const years = Math.floor(months / 12);
    const rest = months % 12;
    const parts = [];

    if (years) parts.push(years + (years === 1 ? " year" : " years"));
    if (rest) parts.push(rest + (rest === 1 ? " month" : " months"));

    return parts.join(" ") || "Less than a month";
}

function updateSpans() {
    document.querySelectorAll("[data-span-from]").forEach((el) => {
        // parsed as local midnight — a bare "YYYY-MM-DD" is treated as UTC and
        // can land on the previous day for anyone west of Greenwich
        const from = new Date(el.dataset.spanFrom + "T00:00:00");
        const to = el.dataset.spanTo
            ? new Date(el.dataset.spanTo + "T00:00:00")
            : new Date();
        if (isNaN(from)) return; // bad date in the markup — leave the fallback text
        el.textContent = formatSpan(from, to);
    });
}

updateSpans();

// project card flip //
// "Details" turns a card over; the corner arrow (or Escape) turns it back.
// Focus follows the flip so keyboard users land on the face they can see.

function setFlip(card, flipped) {
    card.classList.toggle("is-flipped", flipped);
    card.querySelector(".project-flip").setAttribute("aria-expanded", String(flipped));
    card.querySelector(".project-card__back").setAttribute("aria-hidden", String(!flipped));
    const target = card.querySelector(flipped ? ".project-unflip" : ".project-flip");
    // wait for the outgoing face's visibility gate before moving focus
    setTimeout(() => target.focus({ preventScroll: true }), 350);
}

document.addEventListener("click", (event) => {
    if (!event.target.closest) return;
    const open = event.target.closest(".project-flip");
    const close = event.target.closest(".project-unflip");
    if (open) setFlip(open.closest(".project-card"), true);
    else if (close) setFlip(close.closest(".project-card"), false);
});

document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const flipped = document.querySelector(".project-card.is-flipped");
    if (flipped) setFlip(flipped, false);
});
