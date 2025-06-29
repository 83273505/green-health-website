/**
 * Animates an SVG element along an SVG path based on scroll progress
 * within a designated section. Uses IntersectionObserver for performance.
 */
class ScrollPathAnimator {
  /**
   * @param {object} options - Initialization options
   * @param {string} options.svgId - The ID of the SVG container
   * @param {string} options.pathId - The ID of the SVG path
   * @param {string} options.dropId - The ID of the element to animate
   * @param {string} options.sectionId - The ID of the trigger section
   */
  constructor({ svgId, pathId, dropId, sectionId }) {
    this.svg = document.getElementById(svgId);
    this.path = document.getElementById(pathId);
    this.drop = document.getElementById(dropId);
    this.section = document.getElementById(sectionId);

    if (!this.svg || !this.path || !this.drop || !this.section) {
      return;
    }
    if (typeof this.drop.style.offsetDistance === 'undefined') {
      return;
    }

    this.isTicking = false;
    this.scrollHandler = this.onScroll.bind(this);

    this.observer = new IntersectionObserver(
      this.onVisibilityChange.bind(this),
      {
        root: null,
        threshold: 0,
      }
    );

    this.observer.observe(this.section);
  }

  /**
   * Handles visibility changes to add or remove the scroll event listener.
   * @param {IntersectionObserverEntry[]} entries
   */
  onVisibilityChange(entries) {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        window.addEventListener('scroll', this.scrollHandler, { passive: true });
      } else {
        window.removeEventListener('scroll', this.scrollHandler);
      }
    });
  }

  /**
   * Throttles scroll events using requestAnimationFrame.
   */
  onScroll() {
    if (!this.isTicking) {
      window.requestAnimationFrame(() => {
        this.updateAnimation();
        this.isTicking = false;
      });
      this.isTicking = true;
    }
  }

  /**
   * Calculates scroll progress and updates the element's offset-distance.
   */
  updateAnimation() {
    const rect = this.section.getBoundingClientRect();
    const sectionHeight = this.section.offsetHeight;
    const windowHeight = window.innerHeight;

    const scrollProgress = (windowHeight - rect.top) / (sectionHeight + windowHeight);
    const clampedProgress = Math.min(1, Math.max(0, scrollProgress));

    this.drop.style.offsetDistance = `${clampedProgress * 100}%`;
  }
}