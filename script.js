(function() {
    // 環境設定檔
    const ENVIRONMENTS = {
        'greenhealthtw.com.tw': 'production',
        'www.greenhealthtw.com.tw': 'production',
        'staging.greenhealthtw.com.tw': 'staging', // for future use
        'localhost': 'local',
        '127.0.0.1': 'local',
    };

    const currentHostname = location.hostname;
    const domainType = ENVIRONMENTS[currentHostname] || 'other';
    document.body.dataset.domain = domainType;

    // production 環境的保護提示
    if (domainType === 'production') {
        console.log('%c✅ Production Mode: Ensure all debug tools are removed.', 'color: green; font-weight: bold;');
        return; // 正式環境下，後續的警告邏輯不需要執行
    }
    
    // 非 production 環境的視覺警告橫幅
    const warningBanner = document.querySelector('.dev-warning');
    if (warningBanner) {
        let message = '';
        switch(domainType) {
            case 'staging':
                message = '⚠️ 注意：您目前正在【預覽測試版】環境。僅供內部預覽。';
                break;
            case 'local':
                message = '🔧 您目前正在【本機開發】環境。';
                break;
            default:
                 message = '❓ 您目前在一個【未知的】環境中，請確認網址。';
        }
        warningBanner.textContent = message;
    }
})();

function initLadybugAnimation() {
    gsap.registerPlugin(ScrollTrigger, MotionPathPlugin);

    const ladybug = document.querySelector("#ladybug-actor");
    const container = document.querySelector("#farm-to-table .o-container");
    const desktopPaths = document.querySelectorAll("path[data-path='desktop']");

    if (!ladybug || !container || desktopPaths.length === 0) {
        return;
    }

    const ladybugState = {
        dodgeRadius: 80,
        dodgeTween: null,
        flyAwayTimer: null,
        hasFlownAway: false,
        isMouseInside: false,
    };

    const handleMouseMove = (e) => {
        if (ladybugState.hasFlownAway) return;

        const matrix = gsap.getProperty(ladybug, "matrix");
        const centerX = matrix.e;
        const centerY = matrix.f;
        
        const containerRect = container.getBoundingClientRect();
        const mouseX = e.clientX - containerRect.left;
        const mouseY = e.clientY - containerRect.top;

        const dx = mouseX - centerX;
        const dy = mouseY - centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < ladybugState.dodgeRadius) {
            const angle = Math.atan2(dy, dx);
            const dodgeX = -Math.cos(angle) * 30;
            const dodgeY = -Math.sin(angle) * 30;
            
            if (ladybugState.dodgeTween) ladybugState.dodgeTween.kill();
            
            ladybugState.dodgeTween = gsap.to(ladybug, {
                x: dodgeX,
                y: dodgeY,
                rotation: gsap.utils.random(-25, 25),
                scale: 0.85,
                duration: 0.2,
                ease: "power2.out",
            });

            if (!ladybugState.isMouseInside) {
                ladybugState.isMouseInside = true;
                
                if (ladybugState.flyAwayTimer) clearTimeout(ladybugState.flyAwayTimer);
                ladybugState.flyAwayTimer = setTimeout(() => {
                    ladybugState.hasFlownAway = true;
                    container.removeEventListener('mousemove', handleMouseMove);
                    
                    gsap.to(ladybug, {
                        x: dx > 0 ? -400 : 400,
                        y: dy > 0 ? -300 : 300,
                        opacity: 0,
                        scale: 0.5,
                        rotation: gsap.utils.random(360, 720),
                        duration: 1.2,
                        ease: "power2.in",
                        onComplete: () => ladybug.remove()
                    });
                }, 2000);
            }
        } else {
            if (ladybugState.isMouseInside) {
                ladybugState.isMouseInside = false;
                
                clearTimeout(ladybugState.flyAwayTimer);
                ladybugState.flyAwayTimer = null;
                
                if (ladybugState.dodgeTween) ladybugState.dodgeTween.kill();
                ladybugState.dodgeTween = gsap.to(ladybug, {
                    x: 0,
                    y: 0,
                    rotation: 0,
                    scale: 1,
                    duration: 0.6,
                    ease: "elastic.out(1, 0.75)",
                });
            }
        }
    };
    
    ScrollTrigger.matchMedia({
        "(min-width: 768px)": function() {
            if (!desktopPaths || desktopPaths.length === 0) return;
            const randomIndex = Math.floor(Math.random() * desktopPaths.length);
            const randomPath = desktopPaths[randomIndex];

            const tl = gsap.timeline({
                scrollTrigger: {
                    trigger: "#farm-to-table",
                    start: "top 20%",
                    end: "bottom 80%",
                    scrub: 1.5,
                    onEnter: () => container.addEventListener('mousemove', handleMouseMove),
                    onLeave: () => container.removeEventListener('mousemove', handleMouseMove),
                    onEnterBack: () => container.addEventListener('mousemove', handleMouseMove),
                    onLeaveBack: () => container.removeEventListener('mousemove', handleMouseMove),
                },
            });

            tl.set(ladybug, { 
                opacity: 1, 
                visibility: 'visible',
                attr: { src: '/images/ladybug-flying.webp' }
            })
            .to(ladybug, {
                motionPath: {
                    path: randomPath,
                    align: container,
                    alignOrigin: [0.5, 0.5],
                    autoRotate: true,
                },
                duration: 100
            });
        },
        "(max-width: 767px)": function() {
             const tl = gsap.timeline({
                scrollTrigger: {
                    trigger: "#farm-to-table",
                    start: "top center",
                    end: "bottom top",
                    scrub: 1.5,
                },
            });

            tl.set(ladybug, { 
                opacity: 1, 
                visibility: 'visible'
            })
            .to(ladybug, {
                motionPath: {
                    path: "#ladybug-path-mobile",
                    align: container,
                    alignOrigin: [0.5, 0.5],
                    autoRotate: true,
                },
                duration: 100
            });
        }
    });
}


document.addEventListener('DOMContentLoaded', function() {

    function initScrollReveal() {
        const revealElements = document.querySelectorAll('.u-reveal');
        if (revealElements.length === 0) return;

        const revealObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.01, rootMargin: "0px 0px -50px 0px" });

        revealElements.forEach(el => revealObserver.observe(el));
    }

    function initMobileNav() {
        const navToggle = document.querySelector('.c-navbar__toggle');
        const navLinks = document.querySelector('.c-navbar__links');
        const body = document.body;

        if (!navToggle || !navLinks) return;

        navToggle.addEventListener('click', () => {
            const isOpen = navLinks.classList.toggle('nav-open');
            navToggle.classList.toggle('active');
            navToggle.setAttribute('aria-expanded', String(isOpen));
            navToggle.setAttribute('aria-label', isOpen ? '關閉選單' : '開啟選單');
            body.style.overflow = isOpen ? 'hidden' : '';
        });

        navLinks.addEventListener('click', (e) => {
            if (e.target.classList.contains('c-navbar__link')) {
                navLinks.classList.remove('nav-open');
                navToggle.classList.remove('active');
                navToggle.setAttribute('aria-expanded', 'false');
                navToggle.setAttribute('aria-label', '開啟選單');
                body.style.overflow = '';
            }
        });
    }

    function initBackToTopButton() {
        const backToTopBtn = document.querySelector('.c-back-to-top-button');
        if (!backToTopBtn) return;

        window.addEventListener('scroll', () => {
            backToTopBtn.classList.toggle('visible', window.scrollY > 300);
        });

        backToTopBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    function initRecipeCopy() {
        const recipeSection = document.getElementById('recipes');
        if (!recipeSection) return;

        recipeSection.addEventListener('click', function(e) {
            const button = e.target.closest('.c-recipe-item__copy-btn');
            if (!button) return;

            const recipeItem = button.closest('.c-recipe-item');
            const recipeDetails = button.closest('.c-recipe-item__details');
            if (!recipeItem || !recipeDetails) return;

            const recipeTitle = recipeItem.querySelector('.c-recipe-item__title')?.textContent.trim() || '食譜';
            const lines = [`【${recipeTitle}】`, ''];

            Array.from(recipeDetails.children).forEach(element => {
                if (element.classList.contains('c-recipe-item__actions')) return;
                const tagName = element.tagName.toUpperCase();
                if (tagName === 'H4') lines.push(`--- ${element.textContent.trim()} ---`);
                else if (tagName === 'UL') element.querySelectorAll('li').forEach(li => lines.push(`• ${li.textContent.trim()}`));
                else if (tagName === 'OL') element.querySelectorAll('li').forEach((li, i) => lines.push(`${i + 1}. ${li.textContent.trim()}`));
            });

            const textToCopy = lines.join('\n').replace(/\n\n/g, '\n').trim();
            
            navigator.clipboard.writeText(textToCopy).then(() => {
                const originalText = button.textContent;
                button.textContent = '食譜已複製！';
                button.disabled = true;
                setTimeout(() => { 
                    button.textContent = originalText; 
                    button.disabled = false;
                }, 2000);
            }).catch(err => {
                alert('複製失敗，您的瀏覽器可能不支援此功能。');
            });
        });
    }

    function initFlipCards() {
        const flipCards = document.querySelectorAll('.c-flip-card');
        flipCards.forEach(card => {
            const flipAction = (e) => {
                if (e.type === 'click' || e.key === 'Enter' || e.key === ' ') {
                     if (e.type !== 'click') e.preventDefault();
                     card.classList.toggle('is-flipped');
                }
            };
            card.addEventListener('click', flipAction);
            card.addEventListener('keydown', flipAction);
        });
    }

    function initImageGallery() {
        const gallery = document.querySelector('.c-image-gallery');
        if (!gallery) return;

        const mainImage = document.getElementById('main-estate-image');
        const thumbnails = gallery.querySelectorAll('.c-image-gallery__thumbnail');
        const hints = gallery.querySelectorAll('.c-image-gallery__hint');
        
        if (!mainImage || thumbnails.length === 0) return;

        let currentIndex = 0;
        let galleryInterval = null;
        let hintShown = false;
        let hintTimeout = null;
        
        const showHintOnce = () => {
            if (hintShown) return;
            hintShown = true;
            if (hintTimeout) clearTimeout(hintTimeout);
            hints.forEach(h => h.classList.add('visible'));
            hintTimeout = setTimeout(() => {
                hints.forEach(h => h.classList.remove('visible'));
            }, 2500);
        };

        const updateGallery = (index) => {
            if (index < 0 || index >= thumbnails.length) return;
            mainImage.style.opacity = 0;
            setTimeout(() => {
                mainImage.src = thumbnails[index].src;
                mainImage.alt = thumbnails[index].alt;
                mainImage.style.opacity = 1;
            }, 250);
            thumbnails.forEach(thumb => thumb.classList.remove('active'));
            thumbnails[index].classList.add('active');
            currentIndex = index;
        };

        const startGalleryInterval = () => {
            clearInterval(galleryInterval);
            galleryInterval = setInterval(() => {
                const nextIndex = (currentIndex + 1) % thumbnails.length;
                updateGallery(nextIndex);
            }, 5000);
        };

        thumbnails.forEach((thumbnail, index) => {
            thumbnail.addEventListener('click', () => {
                updateGallery(index);
                startGalleryInterval();
            });
        });

        gallery.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                e.preventDefault();
                let nextIndex = (e.key === 'ArrowRight')
                    ? (currentIndex + 1) % thumbnails.length
                    : (currentIndex - 1 + thumbnails.length) % thumbnails.length;
                updateGallery(nextIndex);
                startGalleryInterval();
            }
        });
        
        gallery.addEventListener('mouseenter', showHintOnce);
        gallery.addEventListener('focus', showHintOnce);
        startGalleryInterval();
    }

    function initStickySubNav() {
        const subNav = document.getElementById('subNav');
        if (!subNav) return;
        
        const mainNav = document.getElementById('mainNav');
        const sections = document.querySelectorAll('section[id], article[id]');
        const navLinks = subNav.querySelectorAll('.c-sub-nav__link');
        const heroSection = document.querySelector('.c-hero');
        const heroHeight = heroSection ? heroSection.offsetHeight : 500;
        
        const onScroll = () => {
            const scrollY = window.pageYOffset;
            const navHeight = mainNav ? mainNav.offsetHeight : 73;

            const showSubNav = scrollY > heroHeight - navHeight;
            subNav.classList.toggle('visible', showSubNav);
            if (mainNav) {
                mainNav.classList.toggle('is-hidden', showSubNav);
            }
            
            let currentSectionId = '';
            sections.forEach(section => {
                const sectionTop = section.offsetTop - navHeight - 60; 
                if (scrollY >= sectionTop) {
                    currentSectionId = section.getAttribute('id');
                }
            });

            navLinks.forEach(link => {
                link.classList.remove('active');
                if (link.getAttribute('href') === `#${currentSectionId}`) {
                    link.classList.add('active');
                }
            });
        };
        window.addEventListener('scroll', onScroll, { passive: true });
    }

    function initShrinkingNav() {
        const mainNav = document.getElementById('mainNav');
        if (!mainNav) return;

        window.addEventListener('scroll', () => {
            mainNav.classList.toggle('is-scrolled', window.scrollY > 50);
        }, { passive: true });
    }
    
    function initScrollNarrative() {
        const narrativeSection = document.getElementById('quality');
        if (!narrativeSection) return;

        const steps = narrativeSection.querySelectorAll('.c-timeline__item[data-step]');
        if (steps.length === 0) return;

        const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const step = entry.target.dataset.step;
                    narrativeSection.setAttribute('data-active-step', step);
                }
            });
        }, {
            threshold: 0.6,
            rootMargin: "-30% 0px -30% 0px"
        });

        steps.forEach(step => observer.observe(step));
    }
    
    function initCustomVideoPlayer() {
        const video = document.getElementById('main-video');
        const playBtn = document.getElementById('videoPlayBtn');

        if (!video || !playBtn) return;

        playBtn.addEventListener('click', () => {
            video.play();
        });

        video.addEventListener('play', () => {
            playBtn.classList.add('is-hidden');
            video.controls = true;
        });

        video.addEventListener('pause', () => {
            playBtn.classList.remove('is-hidden');
        });

        video.addEventListener('ended', () => {
            playBtn.classList.remove('is-hidden');
            video.controls = false;
        });
    }

    function initThemeSwitcher() {
        const sections = document.querySelectorAll('[data-theme]');
        if (sections.length === 0) return;
    
        const body = document.body;
        let currentTheme = '';
    
        const observer = new IntersectionObserver(entries => {
            let mostVisibleEntry = null;
            let maxRatio = 0;
    
            entries.forEach(entry => {
                if (entry.isIntersecting && entry.intersectionRatio > maxRatio) {
                    maxRatio = entry.intersectionRatio;
                    mostVisibleEntry = entry;
                }
            });
            
            if (mostVisibleEntry) {
                const newTheme = mostVisibleEntry.target.dataset.theme;
                if (newTheme !== currentTheme) {
                    currentTheme = newTheme;
                    body.dataset.activeTheme = newTheme;
                    
                    const accentColor = mostVisibleEntry.target.dataset.accent;
                    if (accentColor && accentColor.startsWith('#') && accentColor.length === 7) {
                        const hex = accentColor.substring(1);
                        const rgb = [
                            parseInt(hex.substring(0, 2), 16),
                            parseInt(hex.substring(2, 4), 16),
                            parseInt(hex.substring(4, 6), 16)
                        ];
                        document.documentElement.style.setProperty('--theme-accent-color-rgb', rgb.join(', '));
                    }
                }
            } else {
                if (currentTheme !== '') {
                    currentTheme = '';
                    delete body.dataset.activeTheme;
                    document.documentElement.style.removeProperty('--theme-accent-color-rgb');
                }
            }
    
        }, {
            threshold: Array.from({ length: 21 }, (_, i) => i * 0.05),
            rootMargin: "-10% 0px -40% 0px" 
        });
    
        sections.forEach(section => observer.observe(section));
    }

    function initApp() {
        try {
            initLadybugAnimation();
        } catch (error) {
            // Errors in production should be handled by a dedicated service, not console.
        }
        
        initScrollReveal();
        initMobileNav();
        initShrinkingNav();
        initBackToTopButton();
        initRecipeCopy();
        initFlipCards();
        initImageGallery();
        initStickySubNav();
        initScrollNarrative();
        initCustomVideoPlayer();
        initThemeSwitcher();
        
        if (typeof ScrollPathAnimator !== 'undefined') {
            new ScrollPathAnimator({
                svgId: "svg-oil-path-container",
                pathId: "svg-oil-track",
                dropId: "svg-oil-drop",
                sectionId: "quality"
            });
        }
    }

    initApp();
});