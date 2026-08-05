// targeting element from html file for hamburger menu //

function toggleMenu() {
    const menu = document.querySelector(".menu-links");
    const icon = document.querySelector(".hamburger-icon");
    const isOpen = menu.classList.toggle("open");
    icon.classList.toggle("open", isOpen);
    // keep screen readers in sync with what's on screen
    icon.setAttribute("aria-expanded", String(isOpen));
}
