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
    } else {
        // 非 production 環境的視覺警告橫幅
        const warningBanner = document.querySelector('.dev-warning');
        if (warningBanner) {
            let message = '';
            switch(domainType) {
                case 'staging':
                    message = '⚠️ 注意：您目前正在【預覽測試版】環境。僅供內部預覽。';
                    break;
                case 'local':
                    message = '💻 您目前正在【本機開發】環境。';
                    break;
                default:
                     message = '❓ 您目前在一個【未知的】環境中，請確認網址。';
            }
            warningBanner.textContent = message;
        }
    }
})();

document.addEventListener('DOMContentLoaded', function() {

    function initializeHeroExperience() {
        const heroSection = document.getElementById('hero-section');
        if (!heroSection) return;

        const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (prefersReduced) {
            console.log('✅ 偏好減少動態：跳過 3D 動畫模組。');
            const canvas = document.getElementById('hero-canvas');
            if (canvas) canvas.style.display = 'none';
            const heroTitle = document.getElementById('heroTitle');
            if (heroTitle) heroTitle.classList.add('is-unveiled');
            return;
        }

        const observer = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    console.log('🚀 Hero section is visible. Loading 3D animation module...');

                    import('/hero-animation.js')
                        .then(module => {
                            if (module.bootstrapAnimation) {
                                console.log('✅ 3D 動畫模組載入成功，開始執行。');
                                module.bootstrapAnimation();
                            } else {
                                console.error('❌ 3D 動畫模組載入失敗：找不到 bootstrapAnimation 函數。');
                                const heroTitle = document.getElementById('heroTitle');
                                if (heroTitle) heroTitle.classList.add('is-unveiled');
                            }
                        })
                        .catch(error => {
                            console.error('❌ 動態載入 3D 動畫模組失敗:', error);
                            const heroTitle = document.getElementById('heroTitle');
                            if (heroTitle) heroTitle.classList.add('is-unveiled');
                        });

                    observer.unobserve(heroSection);
                }
            });
        }, {
            rootMargin: '50px'
        });

        observer.observe(heroSection);
    }

    function initScrollReveal() {
        const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (prefersReduced || !('IntersectionObserver' in window)) {
            // Keep all content immediately visible
            return;
        }

        const revealElements = document.querySelectorAll('.m-reveal-editorial, .m-reveal-object');
        if (revealElements.length === 0) return;

        try {
            let pendingRevealCount = revealElements.length;
            let scrollCheckScheduled = false;

            const completeReveal = (element, observer) => {
                if (element.classList.contains('visible')) return;
                element.classList.add('visible');
                observer.unobserve(element);
                pendingRevealCount -= 1;
                if (pendingRevealCount === 0) {
                    window.removeEventListener('scroll', schedulePassedRevealCheck);
                }
            };

            const revealObserver = new IntersectionObserver((entries, observer) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        completeReveal(entry.target, observer);
                    }
                });
            }, { threshold: 0, rootMargin: '0px 0px -8% 0px' });

            const revealPassedElements = () => {
                scrollCheckScheduled = false;
                revealElements.forEach(element => {
                    if (element.classList.contains('visible')) return;
                    const rect = element.getBoundingClientRect();
                    if (rect.top < window.innerHeight * 0.92) {
                        completeReveal(element, revealObserver);
                    }
                });
            };

            function schedulePassedRevealCheck() {
                if (scrollCheckScheduled) return;
                scrollCheckScheduled = true;
                window.setTimeout(revealPassedElements, 0);
            }

            revealElements.forEach(element => revealObserver.observe(element));
            document.documentElement.classList.add('js-motion-ready');
            window.addEventListener('scroll', schedulePassedRevealCheck, { passive: true });

            // Elements already inside the initial viewport should never flash hidden.
            revealElements.forEach(element => {
                const rect = element.getBoundingClientRect();
                if (rect.top < window.innerHeight * 0.92 && rect.bottom > 0) {
                    completeReveal(element, revealObserver);
                }
            });
        } catch (error) {
            // Progressive enhancement fallback: CSS defaults keep all content visible.
            document.documentElement.classList.remove('js-motion-ready');
        }
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

    function ensureLazyVideoLoaded(video) {
        const sources = video.querySelectorAll('source[data-src]');
        let changed = false;
        sources.forEach(source => {
            source.src = source.dataset.src;
            source.removeAttribute('data-src');
            changed = true;
        });
        if (video.dataset.src) {
            video.src = video.dataset.src;
            delete video.dataset.src;
            changed = true;
        }
        if (changed) video.load();
    }

    function initJourneyMedia() {
        const gallery = document.querySelector('.c-image-gallery');
        const mainImage = document.getElementById('main-estate-image');
        if (gallery && mainImage) {
            const thumbnails = [...gallery.querySelectorAll('.c-image-gallery__thumbnail')];
            let activeIndex = Math.max(0, thumbnails.findIndex(image => image.classList.contains('active')));
            const selectImage = index => {
                if (!thumbnails.length) return;
                activeIndex = (index + thumbnails.length) % thumbnails.length;
                const selected = thumbnails[activeIndex];
                mainImage.src = selected.src;
                mainImage.alt = selected.alt;
                thumbnails.forEach((image, imageIndex) => image.classList.toggle('active', imageIndex === activeIndex));
            };
            gallery.addEventListener('click', event => {
                const thumbnail = event.target.closest('.c-image-gallery__thumbnail');
                if (thumbnail) selectImage(thumbnails.indexOf(thumbnail));
            });
            gallery.addEventListener('keydown', event => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                event.preventDefault();
                selectImage(activeIndex + (event.key === 'ArrowRight' ? 1 : -1));
            });
        }

        const video = document.getElementById('main-video');
        const playButton = document.getElementById('videoPlayBtn');
        if (video && playButton) {
            playButton.addEventListener('click', async () => {
                ensureLazyVideoLoaded(video);
                video.controls = true;
                try {
                    await video.play();
                } catch (_) {
                    playButton.hidden = false;
                }
            });
            video.addEventListener('play', () => { playButton.hidden = true; });
            video.addEventListener('pause', () => { playButton.hidden = false; });
            video.addEventListener('ended', () => { playButton.hidden = false; });
        }
    }

    function initLazyLoadVideo() {
        const lazyVideos = document.querySelectorAll('.js-lazy-video');
        if (lazyVideos.length === 0) return;

        const lazyVideoObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const video = entry.target;

                    ensureLazyVideoLoaded(video);

                    if (video.hasAttribute('autoplay')) {
                        const playPromise = video.play();
                        if (playPromise !== undefined) {
                            playPromise.catch(error => {
                                console.log("影片自動播放因瀏覽器政策被阻止。", error);
                                video.muted = true;
                                video.play();
                            });
                        }
                    }

                    observer.unobserve(video);
                }
            });
        }, {
            rootMargin: "200px"
        });

        lazyVideos.forEach(video => lazyVideoObserver.observe(video));
    }

    function initializeContactForm() {
        const form = document.getElementById('contact-form');
        if (!form) return;

        let isSubmitting = false;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (isSubmitting) return;

            isSubmitting = true;
            const status = document.getElementById('contact-form-status');
            const submitButton = form.querySelector('button[type="submit"]');
            const data = Object.fromEntries(new FormData(form));

            submitButton.disabled = true;
            status.textContent = '訊息傳送中...';
            status.style.color = 'inherit';

            try {
                const res = await fetch('/.netlify/functions/submit-message', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                const result = await res.json();

                if (res.ok && result.success) {
                    form.reset();
                    status.textContent = '✅ 感謝您的來信，我們已收到您的訊息！';
                    status.style.color = 'green';

                    if (typeof gtag === 'function') {
                        gtag('event', 'generate_lead', {
                            'event_category': 'contact',
                            'event_label': 'form_submission_success'
                        });
                    }
                } else {
                    status.textContent = `❌ 傳送失敗：${result.error || '未知錯誤'}`;
                    status.style.color = 'red';

                    if (typeof gtag === 'function') {
                        gtag('event', 'form_submission_error', {
                            'event_category': 'contact',
                            'event_label': 'server_validation_error'
                        });
                    }
                }
            } catch (err) {
                console.error('[FORM][FETCH_ERROR]', err);
                status.textContent = '❌ 發生網路連線錯誤，請檢查您的網路並重試。';

                if (typeof gtag === 'function') {
                    gtag('event', 'form_submission_error', {
                        'event_category': 'contact',
                        'event_label': 'network_or_system_error'
                    });
                }
            } finally {
                isSubmitting = false;
                submitButton.disabled = false;
            }
        });
    }

    // [NEW] Initialize the contact tabs functionality
    function initAnalyticsTracking() {
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (!link) return;

            const href = link.getAttribute('href') || '';
            if (href.includes('shopee.tw/_a9_5vmt07')) {
                if (typeof gtag === 'function') {
                    gtag('event', 'shopee_store_click', {
                        'event_category': 'ecommerce',
                        'event_label': 'shopee_storefront_outbound'
                    });
                }
            } else if (href.startsWith('mailto:sales@greenhealthtw.com.tw')) {
                if (typeof gtag === 'function') {
                    gtag('event', 'contact_email_click', {
                        'event_category': 'contact',
                        'event_label': 'sales_email_click'
                    });
                }
            }
        });
    }

    function initContactTabs() {
        const tabsContainer = document.querySelector('.c-contact-tabs');
        if (!tabsContainer) return;

        const tabs = tabsContainer.querySelectorAll('.c-contact-tab');
        const panels = document.querySelectorAll('.c-contact-panel');

        tabsContainer.addEventListener('click', (e) => {
            const clickedTab = e.target.closest('.c-contact-tab');
            if (!clickedTab) return;

            const targetPanelId = 'panel-' + clickedTab.dataset.tab;

            // Update tabs
            tabs.forEach(tab => tab.classList.remove('is-active'));
            clickedTab.classList.add('is-active');

            // Update panels
            panels.forEach(panel => {
                panel.classList.toggle('is-active', panel.id === targetPanelId);
            });
        });
    }

    function initApp() {
        initScrollReveal();
        initMobileNav();
        initShrinkingNav();
        initBackToTopButton();
        initRecipeCopy();
        initStickySubNav();
        initThemeSwitcher();
        initJourneyMedia();
        initLazyLoadVideo();
        initializeContactForm();
        initContactTabs();
        initAnalyticsTracking();
    }

    // Start the main sequence
    initializeHeroExperience();
    initApp();
});
