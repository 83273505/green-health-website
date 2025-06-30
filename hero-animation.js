/**
 * @file hero-animation.js
 * @description Green Health 網站英雄區的 3D 水滴與波紋動畫模組。
 * @version 2.1.0 (Performance Optimized: Animation auto-stops after initial sequence)
 * @author Gemini
 * @see https://threejs.org/
 */

import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';

(function() {
    // 確保在 DOM 載入完成後才執行
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        runAnimation();
    } else {
        document.addEventListener('DOMContentLoaded', runAnimation);
    }

    /**
     * 主動畫執行函數
     */
    function runAnimation() {
        const canvas = document.getElementById('hero-canvas');
        if (!canvas) {
            console.error("❌ 動畫初始化失敗：無法找到 ID 為 'hero-canvas' 的畫布元素。");
            return;
        }

        // --- 變數定義 ---
        let scene, camera, renderer;
        let water, drop, impactLight;
        let coronationWaves = [];
        const MAX_WAVES = 5; // 波紋物件池大小

        let clock = new THREE.Clock();
        const dropInitialY = 8;
        let mainDropActive = false;
        let textureLoaded = false;
        
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2(-10, -10);

        // --- 性能優化變數 ---
        let animationFrameId;
        let isAnimationActive = true; // 動畫是否在執行的開關
        const ANIMATION_LIFESPAN = 8000; // 動畫總生命週期 (毫秒)，例如 8 秒後停止
        let animationStopTimer = null; // 用於停止動畫的計時器

        /**
         * 初始化 3D 場景、相機、渲染器與所有物件
         */
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
                antialias: true,
                powerPreference: "low-power" // 提示瀏覽器使用低功耗模式
            });
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // 稍微降低 pixel ratio 來提升性能
            renderer.outputEncoding = THREE.sRGBEncoding;
            
            const ambientLight = new THREE.AmbientLight(0xcccccc, 0.2);
            scene.add(ambientLight);

            const light = new THREE.DirectionalLight(0xfff0dd, 0.8);
            light.position.set(0, 10, 5);
            scene.add(light);
            
            const impactColor = 0xFFB833;
            impactLight = new THREE.PointLight(impactColor, 0, 50);
            impactLight.position.set(0, 2, 0);
            impactLight.visible = false;
            scene.add(impactLight);
            
            createMirrorSurface();
            createQueenTear();
            createCoronationWaves();

            window.addEventListener('resize', onWindowResize, false);
            // 點擊事件保持不變，讓使用者仍可互動
            canvas.addEventListener('click', onCanvasClick);
        }
        
        /**
         * 建立水面
         */
        function createMirrorSurface() {
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

        /**
         * 建立皇后之淚 (水滴)
         */
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
                
                // 延遲觸發主水滴動畫
                setTimeout(triggerMainDrop, 1500); 
            }, undefined, (error) => {
                console.error(`❌ 核心紋理 '${imageUrl}' 載入失敗！動畫將無法正常啟動。`, error);
            });
        }
        
        /**
         * 建立波紋物件池
         */
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

        /**
         * 觸發波紋效果
         * @param {THREE.Vector3} position - 波紋產生的位置
         * @param {boolean} isMainEvent - 是否為主水滴觸發的事件
         */
        function triggerCoronationWave(position, isMainEvent = false) {
            if (impactLight) {
                impactLight.position.copy(position).setY(1.5);
                impactLight.intensity = isMainEvent ? 5 : 2;
                impactLight.visible = true;
            }

            if(isMainEvent) {
                const heroTitle = document.getElementById('heroTitle');
                if(heroTitle) heroTitle.classList.add('is-unveiled');

                // 主水滴落下後，設定計時器以停止動畫
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
                        // 讓波紋在 2-3 秒內結束
                        const duration = (isMainEvent ? 2.5 : 2.0) + Math.random();
                        waveData.mesh.material.opacity = isMainEvent ? 0.9 : 0.5;
                        waveData.duration = duration;
                        waveData.startTime = clock.getElapsedTime();
                    }, triggeredCount * 150);
                    triggeredCount++;
                }
            }
        }

        /**
         * 觸發主水滴下落
         */
        function triggerMainDrop() {
            if (!textureLoaded || !drop) return;
            if (mainDropActive) return;
            mainDropActive = true;
            drop.visible = true;
            drop.position.set(0, dropInitialY, 0);
            drop.material.opacity = 1; 
        }

        /**
         * 處理視窗大小變更
         */
        function onWindowResize() {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
            // 如果動畫已停止，需要手動重新渲染一次以更新畫面
            if (!isAnimationActive) {
                renderer.render(scene, camera);
            }
        }

        /**
         * 處理畫布點擊事件，產生互動波紋
         */
        function onCanvasClick(event) {
            if (!water) return;
            
            // 更新 mouse vector
            mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObject(water);
            if (intersects.length > 0) {
                triggerCoronationWave(intersects[0].point, false);

                // 如果動畫已停止，點擊後短暫重啟
                if (!isAnimationActive) {
                    isAnimationActive = true;
                    animate(); // 重新啟動動畫循環
                    // 設定一個較短的計時器再次停止它
                    if (animationStopTimer) clearTimeout(animationStopTimer);
                    animationStopTimer = setTimeout(stopAnimation, 3000); // 互動後 3 秒停止
                }
            }
        }

        /**
         * 停止動畫循環以節省效能
         */
        function stopAnimation() {
            isAnimationActive = false;
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }
            // 確保所有動態物件在最後一幀被隱藏
            if(drop) drop.visible = false;
            coronationWaves.forEach(wave => wave.mesh.visible = false);
            if(impactLight) impactLight.visible = false;
            
            // 最後再渲染一次，確保畫面是乾淨的靜態水面
            renderer.render(scene, camera);
            console.log('✅ Hero animation stopped to save performance.');
        }

        /**
         * 動畫循環 (Game Loop)
         */
        function animate() {
            // 如果動畫開關為 false，則停止循環
            if (!isAnimationActive) {
                return;
            }

            animationFrameId = requestAnimationFrame(animate);
            
            const deltaTime = clock.getDelta();
            const elapsedTime = clock.getElapsedTime();

            // 持續更新水面材質的時間，使其看起來流動
            if (water) {
                water.material.uniforms['time'].value += deltaTime * 0.4;
            }

            // 主水滴下落動畫 (只執行一次)
            if (mainDropActive && drop) {
                drop.position.y -= 5 * deltaTime; 
                if (drop.position.y <= 0.05) {
                    mainDropActive = false; // 確保不再觸發
                    drop.visible = false;
                    triggerCoronationWave(drop.position, true);
                }
            }

            // 撞擊光效衰減
            if (impactLight && impactLight.visible) {
                impactLight.intensity -= 6 * deltaTime;
                if (impactLight.intensity <= 0) {
                    impactLight.visible = false;
                }
            }

            // 波紋擴散與消失
            coronationWaves.forEach(wave => {
                if (wave.active) {
                    const progress = (elapsedTime - wave.startTime) / wave.duration;
                    if (progress > 1) {
                        wave.active = false;
                        wave.mesh.visible = false;
                    } else {
                        // 使用 easeOutCubic 函式讓擴散速度由快變慢
                        const easedProgress = 1 - Math.pow(1 - progress, 3);
                        const scale = 1 + easedProgress * 35; 
                        wave.mesh.scale.set(scale, scale, scale);
                        // 透明度衰減
                        wave.mesh.material.opacity = Math.max(0, (1 - progress) * 0.9);
                    }
                }
            });

            // 渲染場景
            renderer.render(scene, camera);
        }

        // --- 啟動動畫 ---
        init();
        animate();
    }
})();