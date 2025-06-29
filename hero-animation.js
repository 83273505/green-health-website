/**
 * @file hero-animation.js
 * @description Green Health 網站英雄區的 3D 水滴與波紋動畫模組。
 * @version 1.3.0 (Refactored for Module Loading & Removed Audio)
 * @author [Your Name/Team]
 * @see https://threejs.org/
 */

// ✨ 修正 #1: 直接從 'three' 引入，路徑由 HTML 中的 importmap 解析。
import * as THREE from 'three';
// ✨ 修正 #2: 同樣地，附加元件也從 'three/addons/' 引入。
import { Water } from 'three/addons/objects/Water.js';

(function() {
    // 確保 DOM 載入完成後才執行，這是良好的實踐。
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
        const MAX_WAVES = 5;

        let rainDrops = [];
        const MAX_RAINDROPS = 20;
        let rainStarted = false;
        let rainTexture = null;

        let clock = new THREE.Clock();
        const dropInitialY = 8;
        let mainDropActive = false;
        let textureLoaded = false;
        
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2(-10, -10);

        // --- 音效相關變數已移除 ---

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
            });
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            renderer.outputEncoding = THREE.sRGBEncoding;
            
            // --- 光源設定 ---
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
            
            // --- 物件建立 ---
            createMirrorSurface();
            createQueenTear();
            createRainDropPool();
            createCoronationWaves();

            // --- 事件監聽 ---
            window.addEventListener('resize', onWindowResize, false);
            window.addEventListener('mousemove', onMouseMove, { passive: true });
            canvas.addEventListener('click', onCanvasClick);
            // --- 初始化音效的事件監聽已移除 ---
        }
        
        // --- initAudio 函數已移除 ---

        // --- playSound 函數已移除 ---

        /**
         * 建立水面
         */
        function createMirrorSurface() {
            const waterGeometry = new THREE.PlaneGeometry(100, 100);
            water = new Water(waterGeometry, {
                textureWidth: 512, textureHeight: 512,
                waterNormals: new THREE.TextureLoader().load('https://threejs.org/examples/textures/waternormals.jpg'),
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
         * 建立主要的「皇后之淚」水滴
         */
        function createQueenTear() {
            const textureLoader = new THREE.TextureLoader();
            const imageUrl = 'images/gold_tear_icon.webp';
            
            textureLoader.load(imageUrl, (texture) => {
                rainTexture = texture;
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

        /**
         * 建立雨滴物件池，以供後續重複使用
         */
        function createRainDropPool() {
            if (!rainTexture) {
                 setTimeout(createRainDropPool, 100);
                 return;
            }

            for (let i = 0; i < MAX_RAINDROPS; i++) {
                const spriteMaterial = new THREE.SpriteMaterial({
                    map: rainTexture,
                    transparent: true,
                    opacity: 0.6,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false,
                    color: 0xFFFFFF,
                });
                const rainDrop = new THREE.Sprite(spriteMaterial);
                rainDrop.scale.set(1.0, 1.44, 1.0);
                rainDrop.visible = false;
                scene.add(rainDrop);
                rainDrops.push({ mesh: rainDrop, active: false });
            }
        }
        
        /**
         * 從物件池中觸發一個雨滴
         */
        function triggerRainDrop() {
            const availableDrop = rainDrops.find(d => !d.active);
            if (availableDrop) {
                availableDrop.active = true;
                availableDrop.mesh.visible = true;
                availableDrop.mesh.position.set(
                    (Math.random() - 0.5) * 40,
                    dropInitialY + Math.random() * 5,
                    (Math.random() - 0.5) * 20
                );
            }
        }
        
        /**
         * 建立加冕波紋物件池
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
         * 觸發一次加冕波紋效果
         * @param {THREE.Vector3} position - 波紋觸發的位置
         * @param {boolean} [isMainEvent=false] - 是否為主事件（影響效果強度）
         */
        function triggerCoronationWave(position, isMainEvent = false) {
            if (impactLight) {
                impactLight.position.copy(position).setY(1.5);
                impactLight.intensity = isMainEvent ? 5 : 2;
                impactLight.visible = true;
            }

            let triggeredCount = 0;
            const wavesToTrigger = isMainEvent ? 3 : 1;
            for (let i = 0; i < MAX_WAVES && triggeredCount < wavesToTrigger; i++) {
                if (!coronationWaves[i].active) {
                    const waveData = coronationWaves[i];
                    setTimeout(() => {
                        waveData.active = true;
                        waveData.mesh.visible = true;
                        waveData.mesh.position.copy(position).setY(0.05);
                        waveData.mesh.scale.set(1, 1, 1);
                        waveData.mesh.material.opacity = isMainEvent ? 0.9 : 0.5;
                        waveData.duration = (isMainEvent ? 3.0 : 2.0) + Math.random();
                        waveData.startTime = clock.getElapsedTime();
                        
                        if(isMainEvent) {
                            const heroTitle = document.getElementById('heroTitle');
                            if(heroTitle) heroTitle.classList.add('is-unveiled');
                        }

                    }, triggeredCount * 150);
                    triggeredCount++;
                }
            }
            // --- 播放音效的呼叫已移除 ---
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

        // --- 事件處理函數 ---
        function onMouseMove(event) { mouse.x = (event.clientX / window.innerWidth) * 2 - 1; mouse.y = -(event.clientY / window.innerHeight) * 2 + 1; }
        function onCanvasClick() { if (!water) return; raycaster.setFromCamera(mouse, camera); const intersects = raycaster.intersectObject(water); if (intersects.length > 0) { triggerCoronationWave(intersects[0].point, false); } }
        function onWindowResize() { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); }

        /**
         * 動畫循環 (Game Loop)
         */
        function animate() {
            requestAnimationFrame(animate);
            const deltaTime = clock.getDelta();
            const elapsedTime = clock.getElapsedTime();

            if (water) water.material.uniforms['time'].value += deltaTime * 0.4;

            // 主水滴下落動畫
            if (mainDropActive && drop) {
                drop.position.y -= 5 * deltaTime; 
                if (drop.position.y <= 0.05) {
                    mainDropActive = false;
                    drop.visible = false;
                    triggerCoronationWave(drop.position, true);
                    rainStarted = true;
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
                        const scale = 1 + progress * 35; 
                        wave.mesh.scale.set(scale, scale, scale);
                        wave.mesh.material.opacity *= 0.98; // 每一幀都讓透明度降低一點，製造淡出效果
                    }
                }
            });

            // 雨滴下落與回收
            if (rainStarted && rainDrops.length > 0) {
                if (Math.random() < 0.05) { // 隨機觸發新的雨滴
                    triggerRainDrop();
                }

                rainDrops.forEach(rd => {
                    if (rd.active) {
                        rd.mesh.position.y -= (6 + Math.random() * 3) * deltaTime;
                        if (rd.mesh.position.y < 0) {
                            rd.active = false;
                            rd.mesh.visible = false; // 回收雨滴至物件池
                        }
                    }
                });
            }

            // 渲染場景
            if (renderer && scene && camera) {
                renderer.render(scene, camera);
            }
        }

        // --- 啟動動畫 ---
        init();
        animate();
    }
})();
