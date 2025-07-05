/**
 * @file hero-animation.js
 * @description Green Health 網站英雄區的 3D 水滴與波紋動畫模組。
 * @version 13.0.0 (Production Ready - Ultimate Performance: Canvas to Image)
 * @author Gemini & AI Assistant
 * @see https://threejs.org/
 */

import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';

export function bootstrapAnimation() {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
        console.log('✅ 因使用者偏好減少動態效果，已跳過英雄區動畫。');
        const canvas = document.getElementById('hero-canvas');
        if (canvas) canvas.style.display = 'none';
        
        const heroTitle = document.getElementById('heroTitle');
        if (heroTitle) heroTitle.classList.add('is-unveiled');
        const softText = document.querySelector('.u-text-soft');
        if(softText) softText.style.opacity = 1;
        const ctaContainer = document.querySelector('.c-hero__cta-container');
        if(ctaContainer) ctaContainer.style.opacity = 1;

        return;
    }

    runAnimation();
}

function isMobile() {
    return window.innerWidth < 1024;
}

function runAnimation() {
    const heroSection = document.getElementById('hero-section');
    const canvas = document.getElementById('hero-canvas');
    if (!heroSection || !canvas) {
        console.error("❌ 動畫初始化失敗：找不到 Hero 區塊或 Canvas 元素。");
        return;
    }

    const heroTitle = document.getElementById('heroTitle');
    const softText = document.querySelector('.u-text-soft');
    const ctaContainer = document.querySelector('.c-hero__cta-container');

    let scene, camera, renderer;
    let water, drop, impactLight;
    let coronationWaves = [];
    const MAX_WAVES = 5; 

    let clock = new THREE.Clock();
    const dropInitialY = 8;
    
    let animationFrameId = null;
    let hasPlayed = false;
    let mainSequenceCompleted = false;

    const isMobileMode = isMobile();
    if (isMobileMode) {
        console.log('📱 偵測到行動裝置，執行輕量級 3D 動畫（無水波紋）。');
    } else {
        console.log('💻 偵測到桌機環境，執行一次性高效能 3D 動畫。');
    }

    function init() {
        scene = new THREE.Scene();
        
        const fogColor = 0x05141c;
        scene.fog = new THREE.Fog(fogColor, 15, 40);
        scene.background = new THREE.Color(fogColor);

        camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(0, 5, 14);
        camera.lookAt(scene.position);

        renderer = new THREE.WebGLRenderer({ 
            canvas: canvas,
            antialias: !isMobileMode,
            powerPreference: "low-power",
            preserveDrawingBuffer: true // [NEW] Essential for taking screenshots
        });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        renderer.outputEncoding = THREE.sRGBEncoding;
        
        const ambientLight = new THREE.AmbientLight(0xcccccc, 0.2);
        scene.add(ambientLight);

        const light = new THREE.DirectionalLight(0xfff0dd, 0.8);
        light.position.set(0, 10, 5);
        scene.add(light);
        
        impactLight = new THREE.PointLight(0xFFB833, 0, 50);
        impactLight.position.set(0, 2, 0);
        impactLight.visible = false;
        scene.add(impactLight);
        
        if (!isMobileMode) {
            createStaticWaterSurface();
        } else {
            const clickPlaneGeo = new THREE.PlaneGeometry(100, 100);
            const clickPlaneMat = new THREE.MeshBasicMaterial({ visible: false });
            water = new THREE.Mesh(clickPlaneGeo, clickPlaneMat);
            water.rotation.x = -Math.PI / 2;
            scene.add(water);
        }

        createQueenTear();
        createCoronationWaves();

        gsap.set([softText, ctaContainer], { opacity: 0, y: 20 });
        
        render(); 

        startMainAnimationSequence();

        window.addEventListener('resize', onWindowResize);
    }
    
    function createStaticWaterSurface() {
        // [MODIFIED] Using a slightly lower geometry detail for budgeting
        const waterGeometry = new THREE.PlaneGeometry(100, 100, 64, 64);
        water = new Water(waterGeometry, {
            textureWidth: 256, textureHeight: 256, // Lower texture res for static shot
            waterNormals: new THREE.TextureLoader().load('https://threejs.org/examples/textures/waternormals.jpg', (texture) => {
                texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
            }),
            sunDirection: new THREE.Vector3(0, 10, 5).normalize(),
            sunColor: 0xffe082,
            waterColor: 0x001e26, 
            distortionScale: 1.0, // Low distortion for a calm, screenshot-friendly surface
            fog: true
        });
        water.rotation.x = -Math.PI / 2;
        scene.add(water);
    }

    function createQueenTear() {
        const textureLoader = new THREE.TextureLoader();
        const imageUrl = '/images/gold_tear_icon.webp';
        
        textureLoader.load(imageUrl, (texture) => {
            const spriteMaterial = new THREE.SpriteMaterial({
                map: texture,
                transparent: true,
                opacity: 0,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                color: 0xFFFFFF,
            });
            drop = new THREE.Sprite(spriteMaterial);
            drop.scale.set(2.5, 3.6, 1.0);
            drop.visible = false;
            scene.add(drop);
        }, undefined, (error) => {
            console.error(`❌ 核心紋理 '${imageUrl}' 載入失敗！`, error);
        });
    }
    
    function createCoronationWaves() {
        // ... (This function remains the same)
        for (let i = 0; i < MAX_WAVES; i++) {
            const geo = new THREE.RingGeometry(0.1, 0.2, 64);
            const mat = new THREE.MeshBasicMaterial({ color: 0xFFB833, transparent: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
            const ring = new THREE.Mesh(geo, mat);
            ring.rotation.x = -Math.PI / 2;
            ring.visible = false;
            scene.add(ring);
            coronationWaves.push({ mesh: ring, active: false });
        }
    }

    function triggerCoronationWave(position, isMainEvent = false) {
        // ... (This function remains the same)
        if (impactLight) {
            impactLight.position.copy(position).setY(1.5);
            impactLight.intensity = isMainEvent ? 5 : 2;
            impactLight.visible = true;
        }

        let triggeredCount = 0;
        const wavesToTrigger = isMainEvent ? 3 : 1;
        for (let i = 0; i < MAX_WAVES && triggeredCount < wavesToTrigger; i++) {
            const availableWave = coronationWaves.find(w => !w.active);
            if(availableWave) {
                const waveData = availableWave;
                setTimeout(() => {
                    waveData.active = true;
                    waveData.mesh.visible = true;
                    waveData.mesh.position.copy(position).setY(0.05);
                    waveData.mesh.scale.set(1, 1, 1);
                    const duration = (isMainEvent ? 2.8 : 2.5) + Math.random();
                    waveData.mesh.material.opacity = isMainEvent ? 0.9 : 0.5;
                    waveData.duration = duration;
                    waveData.startTime = clock.getElapsedTime();
                }, triggeredCount * 150);
                triggeredCount++;
            }
        }
    }

    function onWindowResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        if (!animationFrameId) {
            render();
        }
    }
    
    function startMainAnimationSequence() {
        // ... (This function remains the same)
        if (hasPlayed) return;
        
        const checkDropReady = () => {
            if (drop) {
                hasPlayed = true;
                startAnimationLoop();

                const tl = gsap.timeline({
                    delay: 0.5,
                    onComplete: () => {
                        mainSequenceCompleted = true;
                    }
                });
                
                tl.to([softText, ctaContainer], {
                    opacity: 1,
                    y: 0,
                    duration: 1.0,
                    stagger: 0.3,
                    ease: "power2.out"
                });
                
                tl.set(drop, { visible: true }, "+=0.5")
                  .fromTo(drop.material, { opacity: 0 }, { opacity: 1, duration: 0.8 })
                  .fromTo(drop.position, 
                      { y: dropInitialY }, 
                      { 
                          y: 0, 
                          duration: 1.6, 
                          ease: "power2.in",
                          onComplete: () => {
                              drop.visible = false;
                              triggerCoronationWave(drop.position, true);
                          }
                      }, 
                      "<0.3");
        
                tl.call(() => {
                    if (heroTitle) heroTitle.classList.add('is-unveiled');
                }, [], ">1.0");
            } else {
                setTimeout(checkDropReady, 100);
            }
        };

        checkDropReady();
    }
    
    // [MODIFIED] Click interaction is now disabled after the animation plays to prevent issues.
    function onCanvasClick(event) {
        if (!water || hasPlayed) return; // Disable clicks after main animation
        startAnimationLoop();
        mainSequenceCompleted = false;

        const mouse = new THREE.Vector2(
            (event.clientX / window.innerWidth) * 2 - 1,
            -(event.clientY / window.innerHeight) * 2 + 1
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObject(water);

        if (intersects.length > 0) {
            triggerCoronationWave(intersects[0].point, false);
        }
    }

    function render() {
        renderer.render(scene, camera);
    }
    
    function startAnimationLoop() {
        if (!animationFrameId) {
            animate();
        }
    }

    // [MODIFIED] stopAnimationLoop now triggers the cleanup process.
    function stopAnimationLoop() {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
            console.log('✅ 動畫已完全結束，準備替換 Canvas 並釋放資源...');
            takeScreenshotAndReplaceCanvas();
        }
    }

    // [NEW] Takes a final screenshot, applies it as a background, and cleans up the scene.
    function takeScreenshotAndReplaceCanvas() {
        // Render one last time to ensure everything is in its final state
        render();
        const screenshotDataUrl = renderer.domElement.toDataURL('image/webp', 0.8);
        
        // Apply as background to the parent container
        const videoWrapper = heroSection.querySelector('.c-hero__video-wrapper');
        if (videoWrapper) {
            videoWrapper.style.backgroundImage = `url(${screenshotDataUrl})`;
            videoWrapper.style.backgroundSize = 'cover';
            videoWrapper.style.backgroundPosition = 'center';
        }

        // Hide the canvas and clean up resources
        canvas.style.display = 'none';
        cleanupScene();
    }
    
    // [NEW] Thoroughly disposes of Three.js resources to free up memory.
    function cleanupScene() {
        console.log('🧹 正在清理 3D 場景資源...');
        scene.traverse(object => {
            if (object.isMesh || object.isSprite) {
                if (object.geometry) {
                    object.geometry.dispose();
                }
                if (object.material) {
                    if (object.material.isMaterial) {
                        cleanMaterial(object.material);
                    } else {
                        // For multi-material objects
                        for (const material of object.material) {
                            cleanMaterial(material);
                        }
                    }
                }
            }
        });
        
        renderer.dispose();
        renderer.forceContextLoss();

        // Remove event listeners
        window.removeEventListener('resize', onWindowResize);
        
        console.log('💯 資源已完全釋放。');

        function cleanMaterial(material) {
            material.dispose();
            for (const key of Object.keys(material)) {
                const value = material[key];
                if (value && typeof value === 'object' && 'isTexture' in value) {
                    value.dispose();
                }
            }
        }
    }
    
    function isAnythingActive() {
        if (impactLight && impactLight.visible) return true;
        if (coronationWaves.some(w => w.active)) return true;
        return false;
    }

    function animate() {
        animationFrameId = requestAnimationFrame(animate);

        const elapsedTime = clock.getElapsedTime();
        const deltaTime = Math.min(clock.getDelta(), 1/30);
        
        if (impactLight && impactLight.visible) {
            impactLight.intensity -= 6 * deltaTime;
            if (impactLight.intensity <= 0) impactLight.visible = false;
        }

        coronationWaves.forEach(wave => {
            if (wave.active) {
                const progress = (elapsedTime - wave.startTime) / wave.duration;
                if (progress >= 1) {
                    wave.active = false;
                    wave.mesh.visible = false;
                } else {
                    const easedProgress = 1 - Math.pow(1 - progress, 3);
                    const scale = 1 + easedProgress * 35; 
                    wave.mesh.scale.set(scale, scale, scale);
                    wave.mesh.material.opacity = Math.max(0, (1 - progress) * 0.9);
                }
            }
        });

        render();

        if (mainSequenceCompleted && !isAnythingActive()) {
            stopAnimationLoop();
        }
    }

    init();
}