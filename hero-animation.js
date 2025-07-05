/**
 * @file hero-animation.js
 * @description Green Health 網站英雄區的 3D 水滴與波紋動畫模組。
 * @version 7.0.0 (Production Ready - Adaptive & Optimized)
 * @author Gemini & AI Assistant
 * @see https://threejs.org/
 */

import * as THREE from 'three';
// [MODIFIED] Water is now conditionally imported.
import { Water } from 'three/addons/objects/Water.js';

export function bootstrapAnimation() {
    // 檢查使用者是否偏好減少動態效果
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
        console.log('✅ 因使用者偏好減少動態效果，已跳過英雄區動畫。');
        const canvas = document.getElementById('hero-canvas');
        if (canvas) canvas.style.display = 'none';
        
        // 手動觸發文字顯示
        const heroTitle = document.getElementById('heroTitle');
        if (heroTitle) {
            const titleText = heroTitle.querySelector('.c-hero__title-text');
            const softText = document.querySelector('.u-text-soft');
            const ctaContainer = document.querySelector('.c-hero__cta-container');
            if (titleText) titleText.style.opacity = '1';
            if (softText) softText.style.opacity = '1';
            if (ctaContainer) ctaContainer.style.opacity = '1';
        }
        return;
    }

    runAnimation();
}

/**
 * [NEW] Helper function to determine if it's a mobile environment.
 * @returns {boolean}
 */
function isMobile() {
    // A simple check is usually sufficient. 
    // For this project, a width-based check aligns with the JS/CSS logic.
    return window.innerWidth < 1024;
}


/**
 * 主動畫執行函數
 */
function runAnimation() {
    const canvas = document.getElementById('hero-canvas');
    if (!canvas) {
        console.error("❌ 動畫初始化失敗：找不到 ID 為 'hero-canvas' 的畫布元素。");
        return;
    }

    // --- 核心變數 ---
    let scene, camera, renderer;
    let water, drop, impactLight;
    let coronationWaves = [];
    const MAX_WAVES = 5; 

    let clock = new THREE.Clock();
    const dropInitialY = 8;
    let mainDropActive = false;
    let textureLoaded = false;
    
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(-10, -10);

    // --- 效能優化變數 ---
    let animationFrameId;
    let isAnimationActive = true; 
    const ANIMATION_LIFESPAN = 10000;
    let animationStopTimer = null; 
    
    // [MODIFIED] Determine mode once at the start.
    const isMobileMode = isMobile();
    if (isMobileMode) {
        console.log('📱 偵測到行動裝置，執行輕量級 3D 動畫（無水波紋）。');
    } else {
        console.log('💻 偵測到桌機環境，執行完整 3D 動畫。');
    }


    /**
     * 初始化場景、相機、渲染器與物件
     */
    function init() {
        scene = new THREE.Scene();
        
        const fogColor = 0x05141c;
        scene.fog = new THREE.Fog(fogColor, 15, 40);

        // [MODIFIED] Set background based on mode
        if (isMobileMode) {
            // For mobile, use a simple color background for performance.
            scene.background = new THREE.Color(fogColor);
        }

        camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(0, 5, 14);
        camera.lookAt(scene.position);

        renderer = new THREE.WebGLRenderer({ 
            canvas: canvas,
            antialias: !isMobileMode, // Disable antialias on mobile for performance
            powerPreference: "low-power"
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
        
        // [MODIFIED] Conditional creation of the water surface
        if (!isMobileMode) {
            createWaterSurface();
        } else {
            // On mobile, create a simple, invisible plane for raycasting clicks.
            const clickPlaneGeo = new THREE.PlaneGeometry(100, 100);
            const clickPlaneMat = new THREE.MeshBasicMaterial({ visible: false });
            const clickPlane = new THREE.Mesh(clickPlaneGeo, clickPlaneMat);
            clickPlane.rotation.x = -Math.PI / 2;
            scene.add(clickPlane);
            // Re-assign to 'water' variable so the raycaster can use it.
            water = clickPlane; 
        }

        createQueenTear();
        createCoronationWaves();

        window.addEventListener('resize', onWindowResize, false);
        canvas.addEventListener('click', onCanvasClick);
    }
    
    // [MODIFIED] Renamed for clarity, was createMirrorSurface
    function createWaterSurface() {
        const waterGeometry = new THREE.PlaneGeometry(100, 100);
        water = new Water(waterGeometry, {
            textureWidth: 512, textureHeight: 512,
            waterNormals: new THREE.TextureLoader().load('https://threejs.org/examples/textures/waternormals.jpg', (texture) => {
                texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
            }),
            sunDirection: new THREE.Vector3(0, 10, 5).normalize(),
            sunColor: 0xffe082,
            waterColor: 0x004060,
            distortionScale: 3.7,
            fog: true
        });
        water.rotation.x = -Math.PI / 2;
        scene.add(water);
    }

    function createQueenTear() {
        const textureLoader = new THREE.TextureLoader();
        const imageUrl = '/images/gold_tear_icon.webp';
        
        textureLoader.load(imageUrl, (texture) => {
            textureLoaded = true;
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
            
            setTimeout(triggerMainDrop, 1500); 
        }, undefined, (error) => {
            console.error(`❌ 核心紋理 '${imageUrl}' 載入失敗！動畫將無法正常啟動。`, error);
        });
    }
    
    function createCoronationWaves() {
        for (let i = 0; i < MAX_WAVES; i++) {
            const geo = new THREE.RingGeometry(0.1, 0.2, 64);
            const mat = new THREE.MeshBasicMaterial({ 
                color: 0xFFB833,
                transparent: true, 
                blending: THREE.AdditiveBlending,
                side: THREE.DoubleSide
            });
            const ring = new THREE.Mesh(geo, mat);
            ring.rotation.x = -Math.PI / 2;
            ring.visible = false;
            scene.add(ring);
            coronationWaves.push({ mesh: ring, active: false });
        }
    }

    function triggerCoronationWave(position, isMainEvent = false) {
        if (impactLight) {
            impactLight.position.copy(position).setY(1.5);
            impactLight.intensity = isMainEvent ? 5 : 2;
            impactLight.visible = true;
        }

        if(isMainEvent) {
            const heroTitle = document.getElementById('heroTitle');
            if(heroTitle) heroTitle.classList.add('is-unveiled');
            
            if (animationStopTimer) clearTimeout(animationStopTimer);
            animationStopTimer = setTimeout(stopAnimation, ANIMATION_LIFESPAN);
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
                    const duration = (isMainEvent ? 2.5 : 2.0) + Math.random();
                    waveData.mesh.material.opacity = isMainEvent ? 0.9 : 0.5;
                    waveData.duration = duration;
                    waveData.startTime = clock.getElapsedTime();
                }, triggeredCount * 150);
                triggeredCount++;
            }
        }
    }

    function triggerMainDrop() {
        if (!textureLoaded || !drop || mainDropActive) return;
        
        mainDropActive = true;
        drop.visible = true;
        drop.position.set(0, dropInitialY, 0);
        drop.material.opacity = 1;
        drop.startTime = clock.getElapsedTime();
    }

    function onWindowResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        if (!isAnimationActive) {
            renderer.render(scene, camera);
        }
    }

    function onCanvasClick(event) {
        if (!water) return; // 'water' is now the click plane on mobile
        
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObject(water);
        if (intersects.length > 0) {
            triggerCoronationWave(intersects[0].point, false);

            if (!isAnimationActive) {
                isAnimationActive = true;
                animate(); 
                if (animationStopTimer) clearTimeout(animationStopTimer);
                animationStopTimer = setTimeout(stopAnimation, 3000); 
            }
        }
    }

    function stopAnimation() {
        isAnimationActive = false;
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
        if(drop) drop.visible = false;
        coronationWaves.forEach(wave => wave.mesh.visible = false);
        if(impactLight) impactLight.visible = false;
        
        renderer.render(scene, camera);
        console.log('✅ 英雄區動畫已停止以節省效能。');
    }

    function animate() {
        if (!isAnimationActive) return;

        animationFrameId = requestAnimationFrame(animate);
        
        const elapsedTime = clock.getElapsedTime();
        const deltaTime = Math.min(clock.getDelta(), 1/30);
        
        // [MODIFIED] Only update water uniforms if water exists (i.e., not mobile mode)
        if (water && water.isWater) {
            water.material.uniforms['time'].value += deltaTime * 0.4;
        }

        if (mainDropActive && drop && drop.startTime) {
            const timeSinceDropStart = elapsedTime - drop.startTime;
            const fallDuration = 1.6;
            const fallProgress = Math.min(timeSinceDropStart / fallDuration, 1);
            const easedProgress = fallProgress * fallProgress;
            
            drop.position.y = dropInitialY * (1 - easedProgress);

            if (fallProgress >= 1) {
                mainDropActive = false;
                drop.visible = false;
                triggerCoronationWave(drop.position, true);
            }
        }

        if (impactLight && impactLight.visible) {
            impactLight.intensity -= 6 * deltaTime;
            if (impactLight.intensity <= 0) {
                impactLight.visible = false;
            }
        }

        coronationWaves.forEach(wave => {
            if (wave.active) {
                const progress = (elapsedTime - wave.startTime) / wave.duration;
                if (progress > 1) {
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

        renderer.render(scene, camera);
    }

    init();
    animate();
}