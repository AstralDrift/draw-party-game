const PLAY_URL = import.meta.env.VITE_PLAY_URL ?? "/";

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function setPlayCtaHref(): void {
  const cta = document.getElementById("play-cta");
  if (cta instanceof HTMLAnchorElement) {
    cta.href = PLAY_URL;
  }
}

function initReveal(): void {
  const items = document.querySelectorAll<HTMLElement>("[data-reveal]");
  if (prefersReducedMotion()) {
    items.forEach((el) => el.classList.add("is-visible"));
    return;
  }

  items.forEach((el, index) => {
    el.style.setProperty("--reveal-delay", `${index * 60}ms`);
  });

  const hero = document.getElementById("hero");
  const heroItems = hero?.querySelectorAll<HTMLElement>("[data-reveal]") ?? [];
  heroItems.forEach((el, index) => {
    el.classList.add("is-visible");
    el.style.setProperty("--reveal-delay", `${index * 60}ms`);
  });

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
  );

  items.forEach((el) => {
    if (hero?.contains(el)) {
      return;
    }
    observer.observe(el);
  });
}

function initHeroParallax(): void {
  if (prefersReducedMotion()) {
    return;
  }

  const hero = document.getElementById("hero");
  const layer = document.querySelector<HTMLElement>("[data-hero-parallax]");
  if (!hero || !layer) {
    return;
  }

  let ticking = false;

  const update = (): void => {
    ticking = false;
    const rect = hero.getBoundingClientRect();
    const height = hero.offsetHeight || 1;
    const scrolled = -rect.top;
    const progress = Math.min(1, Math.max(0, scrolled / height));
    const offset = progress * 28;
    layer.style.transform = `translate3d(0, ${offset}px, 0)`;
  };

  const onScroll = (): void => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  update();
}

setPlayCtaHref();
initReveal();
initHeroParallax();
