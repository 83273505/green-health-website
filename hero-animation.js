/**
 * @file hero-animation.js
 * @description Green Health 網站英雄區的 3D 水滴與波紋動畫模組。
 * @version 2.0.0 (Minimalist Performance Refactor: Single drop, persistent water waves)
 * @author [Your Name/Team]
 * @see https://threejs.org/
 */

import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';

(function() {
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

        // --- 變數定義 (已精簡) ---
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
            createCoronationWaves(); // 只建立波紋物件池

            window.addEventListener('resize', onWindowResize, false);
            window.addEventListener('mousemove', onMouseMove, { passive: true });
            canvas.addEventListener('click', onCanvasClick);
        }
        
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

        function createQueenTear() {
            const textureLoader = new THREE.TextureLoader();
            const imageUrl = 'images/gold_tear_icon.webp'; // 使用相對路徑以利本地測試
            
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
                        waveData.mesh.material.opacity = isMainEvent ? 0.9 : 0.5;
                        waveData.duration = (isMainEvent ? 3.0 : 2.0) + Math.random();
                        waveData.startTime = clock.getElapsedTime();
                    }, triggeredCount * 150);
                    triggeredCount++;
                }
            }
        }

        function triggerMainDrop() {
            if (!textureLoaded || !drop) return;
            if (mainDropActive) return;
            mainDropActive = true;
            drop.visible = true;
            drop.position.set(0, dropInitialY, 0);
            drop.material.opacity = 1; 
        }

        function onMouseMove(event) { mouse.x = (event.clientX / window.innerWidth) * 2 - 1; mouse.y = -(event.clientY / window.innerHeight) * 2 + 1; }
        function onCanvasClick() { if (!water) return; raycaster.setFromCamera(mouse, camera); const intersects = raycaster.intersectObject(water); if (intersects.length > 0) { triggerCoronationWave(intersects[0].point, false); } }
        function onWindowResize() { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); }

        /**
         * 動畫循環 (Game Loop) - 已精簡
         */
        function animate() {
            requestAnimationFrame(animate);
            const deltaTime = clock.getDelta();
            const elapsedTime = clock.getElapsedTime();

            // 只保留水面動畫
            if (water) water.material.uniforms['time'].value += deltaTime * 0.4;

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
                        const scale = 1 + progress * 35; 
                        wave.mesh.scale.set(scale, scale, scale);
                        wave.mesh.material.opacity *= 0.98;
                    }
                }
            });

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