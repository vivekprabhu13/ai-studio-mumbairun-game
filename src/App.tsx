/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Play, RotateCcw, AlertTriangle } from 'lucide-react';

// --- Constants ---
const LANE_WIDTH = 4;
const LANES = [-LANE_WIDTH, 0, LANE_WIDTH];
const INITIAL_SPEED = 0.5;
const SPEED_INCREMENT = 0.0001;
const OBSTACLE_SPAWN_INTERVAL = 1500; // ms
const ROAD_LENGTH = 1000;
const ROAD_WIDTH = 18;

// --- Types ---
type ObstacleType = 'POTHOLE' | 'DOG' | 'HUMAN' | 'SIGN';

interface Obstacle {
  mesh: THREE.Object3D;
  lane: number;
  type: ObstacleType;
}

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [gameState, setGameState] = useState<'START' | 'PLAYING' | 'GAMEOVER'>('START');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);

  // Refs for game logic (to avoid React state overhead in loop)
  const gameRef = useRef({
    scene: null as THREE.Scene | null,
    camera: null as THREE.PerspectiveCamera | null,
    renderer: null as THREE.WebGLRenderer | null,
    rickshaw: null as THREE.Group | null,
    obstacles: [] as Obstacle[],
    laneLines: [] as THREE.Mesh[],
    road: null as THREE.Mesh | null,
    laneIndex: 1, // 0: left, 1: center, 2: right
    speed: INITIAL_SPEED,
    lastObstacleTime: 0,
    clock: new THREE.Clock(),
    animationFrame: 0,
  });

  const stopGame = () => {
    cancelAnimationFrame(gameRef.current.animationFrame);
    setGameState('GAMEOVER');
  };

  const initGame = () => {
    const { current: game } = gameRef;
    if (!containerRef.current) return;

    // 1. Scene & Camera
    game.scene = new THREE.Scene();
    game.scene.background = new THREE.Color(0x87ceeb); // Sky blue
    game.scene.fog = new THREE.Fog(0x87ceeb, 10, 150);

    game.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    game.camera.position.set(0, 8, 15);
    game.camera.lookAt(0, 1, -10);

    // 2. Renderer
    game.renderer = new THREE.WebGLRenderer({ antialias: true });
    game.renderer.setSize(window.innerWidth, window.innerHeight);
    game.renderer.shadowMap.enabled = true;
    containerRef.current.appendChild(game.renderer.domElement);

    // 3. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    game.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(10, 40, 20);
    dirLight.castShadow = true;
    game.scene.add(dirLight);

    // 4. Road & Surroundings
    // Ground/Grass
    const groundGeo = new THREE.PlaneGeometry(1000, 1000);
    const groundMat = new THREE.MeshPhongMaterial({ color: 0x10B981 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.15;
    ground.receiveShadow = true;
    game.scene.add(ground);

    // Road (Lighter Slate for visibility)
    const roadGeo = new THREE.PlaneGeometry(ROAD_WIDTH, 1000);
    const roadMat = new THREE.MeshPhongMaterial({ color: 0x64748b });
    game.road = new THREE.Mesh(roadGeo, roadMat);
    game.road.rotation.x = -Math.PI / 2;
    game.road.receiveShadow = true;
    game.scene.add(game.road);

    // Environment & Decor (Buildings, Lane lines, Clouds, Trees, Poles)
    game.laneLines = [];
    
    // 1. Lane lines
    const lineGeo = new THREE.PlaneGeometry(0.3, 3);
    const lineMat = new THREE.MeshPhongMaterial({ color: 0xffffff });
    
    // 2. Objects for movement logic
    for (let z = 0; z < 400; z += 15) {
      // Lane lines
      for (let i = -1; i <= 1; i += 2) {
        const line = new THREE.Mesh(lineGeo, lineMat);
        line.rotation.x = -Math.PI / 2;
        line.position.set(i * (LANE_WIDTH / 2 + 0.15), 0.02, -z);
        game.scene.add(line);
        game.laneLines.push(line);
      }

      // Buildings & Iconic Mumbai Elements
      for (let side = -1; side <= 1; side += 2) {
        if (side === 0) continue;
        
        const bWidth = 10 + Math.random() * 5;
        const bHeight = 15 + Math.random() * 40; // More height variation
        const bDepth = 12 + Math.random() * 5;
        
        const buildingGroup = new THREE.Group();

        // Main Structure
        const buildingGeo = new THREE.BoxGeometry(bWidth, bHeight, bDepth);
        // Mumbai color palette: faded pinks, yellows, blues, and concrete grays
        const colors = [0xfcc2d7, 0xfff3bf, 0xd0ebff, 0xe9ecef, 0xffd8a8, 0xc0eb75];
        const color = colors[Math.floor(Math.random() * colors.length)];
        const buildingMat = new THREE.MeshPhongMaterial({ color: new THREE.Color(color) });
        const building = new THREE.Mesh(buildingGeo, buildingMat);
        building.position.y = bHeight / 2;
        building.castShadow = true;
        building.receiveShadow = true;
        buildingGroup.add(building);

        // Architectural Details (Ledges/Balconies - very Mumbai style)
        for (let floor = 1; floor < bHeight / 4; floor++) {
          const ledgeGeo = new THREE.BoxGeometry(bWidth + 0.6, 0.4, bDepth + 0.2);
          const ledge = new THREE.Mesh(ledgeGeo, new THREE.MeshPhongMaterial({ color: 0xcccccc }));
          ledge.position.y = floor * 4;
          buildingGroup.add(ledge);
          
          // Tiny AC units on buildings
          if (Math.random() > 0.6) {
             const acGeo = new THREE.BoxGeometry(0.8, 0.6, 0.4);
             const ac = new THREE.Mesh(acGeo, new THREE.MeshPhongMaterial({ color: 0xeeeeee }));
             ac.position.set(-side * (bWidth / 2 + 0.2), floor * 4 + 1, (Math.random() - 0.5) * bDepth);
             buildingGroup.add(ac);
          }
        }

        // Billboards (Large colorful ads common in Mumbai)
        if (Math.random() > 0.7) {
            const billWidth = 6 + Math.random() * 4;
            const billHeight = 4 + Math.random() * 2;
            const billGroup = new THREE.Group();
            
            const frame = new THREE.Mesh(new THREE.BoxGeometry(billWidth + 0.4, billHeight + 0.4, 0.2), new THREE.MeshPhongMaterial({ color: 0x333333 }));
            const board = new THREE.Mesh(new THREE.PlaneGeometry(billWidth, billHeight), new THREE.MeshPhongMaterial({ 
                color: new THREE.Color().setHSL(Math.random(), 0.8, 0.6),
                emissive: new THREE.Color().setHSL(Math.random(), 0.8, 0.6),
                emissiveIntensity: 0.3
            }));
            board.position.z = 0.11;
            billGroup.add(frame, board);
            
            billGroup.position.set(-side * (bWidth / 2 + 0.5), bHeight - 5, (Math.random() - 0.5) * bDepth);
            billGroup.rotation.y = side * Math.PI / 2;
            buildingGroup.add(billGroup);
        }

        // Shop Front / Signage (Bottom level)
        const signGeo = new THREE.PlaneGeometry(bWidth * 0.7, 1.8);
        const signColor = new THREE.Color().setHSL(Math.random(), 0.9, 0.5);
        const signMat = new THREE.MeshPhongMaterial({ color: signColor, emissive: signColor, emissiveIntensity: 0.2 });
        const sign = new THREE.Mesh(signGeo, signMat);
        sign.position.set(-side * (bWidth / 2 + 0.1), 4, 0);
        sign.rotation.y = side * Math.PI / 2;
        buildingGroup.add(sign);

        // Shop Window (Grill look)
        const windowGeo = new THREE.PlaneGeometry(bWidth * 0.8, 2.5);
        const windowMat = new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 50 });
        const shopWindow = new THREE.Mesh(windowGeo, windowMat);
        shopWindow.position.set(-side * (bWidth / 2 + 0.05), 1.5, 0);
        shopWindow.rotation.y = side * Math.PI / 2;
        buildingGroup.add(shopWindow);

        buildingGroup.position.set(side * (ROAD_WIDTH / 2 + bWidth / 2 + 2), 0, -z);
        game.scene.add(buildingGroup);
        game.laneLines.push(buildingGroup as any);
      }

      // 3. Street Lights / Electric Poles
      for (let side = -1; side <= 1; side += 2) {
         if (side === 0) continue;
         const poleGroup = new THREE.Group();
         const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 12), new THREE.MeshPhongMaterial({ color: 0x222222 }));
         pole.position.y = 6;
         poleGroup.add(pole);
         
         const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2), new THREE.MeshPhongMaterial({ color: 0x222222 }));
         arm.rotation.z = Math.PI / 2;
         arm.position.set(-side * 1, 11.5, 0);
         poleGroup.add(arm);
         
         const light = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), new THREE.MeshPhongMaterial({ color: 0xffffee, emissive: 0xffcc00, emissiveIntensity: 0.5 }));
         light.position.set(-side * 2, 11.2, 0);
         poleGroup.add(light);

         poleGroup.position.set(side * (ROAD_WIDTH / 2 + 0.5), 0, -z - 7);
         game.scene.add(poleGroup);
         game.laneLines.push(poleGroup as any);
      }

      // 4. Palm Trees (Mumbai is a coastal city)
      if (Math.random() > 0.4) {
          const treeGroup = new THREE.Group();
          const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 8, 8), new THREE.MeshPhongMaterial({ color: 0x5d4037 }));
          trunk.position.y = 4;
          treeGroup.add(trunk);
          
          for(let i=0; i<6; i++) {
              const leaf = new THREE.Mesh(new THREE.BoxGeometry(4, 0.1, 1), new THREE.MeshPhongMaterial({ color: 0x2e7d32 }));
              leaf.position.y = 8;
              leaf.rotation.y = (i / 6) * Math.PI * 2;
              leaf.rotation.z = 0.4;
              treeGroup.add(leaf);
          }
          const side = Math.random() > 0.5 ? 1 : -1;
          treeGroup.position.set(side * (ROAD_WIDTH / 2 + 4.5), 0, -z - 3);
          game.scene.add(treeGroup);
          game.laneLines.push(treeGroup as any);
      }

      // 5. Clouds (Whiter, fluffier)
      if (Math.random() > 0.6) {
        const cloudGroup = new THREE.Group();
        const cloudGeo = new THREE.SphereGeometry(2, 8, 8);
        const cloudMat = new THREE.MeshPhongMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 });
        
        for(let i=0; i<6; i++) {
            const part = new THREE.Mesh(cloudGeo, cloudMat);
            part.position.set(Math.random()*6 - 3, Math.random()*2, Math.random()*6 - 3);
            part.scale.set(1 + Math.random()*1.5, 0.6 + Math.random(), 1 + Math.random()*1.5);
            cloudGroup.add(part);
        }
        cloudGroup.position.set((Math.random()-0.5) * 150, 40 + Math.random()*15, -z);
        game.scene.add(cloudGroup);
        game.laneLines.push(cloudGroup as any);
      }
    }

    // 5. Rickshaw
    game.rickshaw = createRickshaw();
    game.rickshaw.position.set(LANES[game.laneIndex], 0, 0);
    game.scene.add(game.rickshaw);

    // Start loop
    game.clock.start();
    animate();
  };

  const createRickshaw = () => {
    const group = new THREE.Group();

    // Body (Main Chassis)
    const bodyGeo = new THREE.BoxGeometry(2.2, 1.8, 3.4);
    const bodyMat = new THREE.MeshPhongMaterial({ color: 0x000000 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1.2;
    body.castShadow = true;
    group.add(body);

    // Interior (Seat)
    const seatGeo = new THREE.BoxGeometry(1.9, 0.5, 1.2);
    const seatMat = new THREE.MeshPhongMaterial({ color: 0x222222 });
    const seat = new THREE.Mesh(seatGeo, seatMat);
    seat.position.set(0, 1, 0.8);
    group.add(seat);

    // Front Panel (Dashboard)
    const dashGeo = new THREE.BoxGeometry(1.8, 0.8, 0.2);
    const dash = new THREE.Mesh(dashGeo, seatMat);
    dash.position.set(0, 1.2, -1.2);
    group.add(dash);

    // Digital Meter (Glowing)
    const meterGeo = new THREE.BoxGeometry(0.3, 0.2, 0.1);
    const meterMat = new THREE.MeshPhongMaterial({ color: 0x00ff00, emissive: 0x004400 });
    const meter = new THREE.Mesh(meterGeo, meterMat);
    meter.position.set(0.6, 1.45, -1.1);
    group.add(meter);

    // Roof (Classic Yellow)
    const roofGeo = new THREE.BoxGeometry(2.4, 0.15, 3.8);
    const roofMat = new THREE.MeshPhongMaterial({ color: 0xFACC15 });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = 2.45;
    group.add(roof);

    // Pillars
    const pillarGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.2);
    const pillarMat = new THREE.MeshPhongMaterial({ color: 0x111111 });
    const pillarPos = [
      [-1, 1.8, -1.6], [1, 1.8, -1.6],
      [-1, 1.8, 1.6], [1, 1.8, 1.6]
    ];
    pillarPos.forEach(([x, y, z]) => {
      const p = new THREE.Mesh(pillarGeo, pillarMat);
      p.position.set(x, y, z);
      group.add(p);
    });

    // Mirrors
    const mirrorGeo = new THREE.BoxGeometry(0.4, 0.6, 0.05);
    const mirrorMat = new THREE.MeshPhongMaterial({ color: 0x888888, shininess: 100 });
    const mLeft = new THREE.Mesh(mirrorGeo, mirrorMat);
    mLeft.position.set(-1.2, 1.8, -1.5);
    mLeft.rotation.y = -0.3;
    const mRight = mLeft.clone();
    mRight.position.x = 1.2;
    mRight.rotation.y = 0.3;
    group.add(mLeft, mRight);

    // Windshield
    const glassGeo = new THREE.PlaneGeometry(2, 1);
    const glassMat = new THREE.MeshPhongMaterial({ color: 0x88ccff, transparent: true, opacity: 0.4 });
    const glass = new THREE.Mesh(glassGeo, glassMat);
    glass.position.set(0, 1.8, -1.65);
    group.add(glass);

    // Front Mudguard (Curved look using box)
    const mudGeo = new THREE.BoxGeometry(0.9, 0.6, 1.2);
    const mud = new THREE.Mesh(mudGeo, bodyMat);
    mud.position.set(0, 0.7, -1.6);
    group.add(mud);

    // Headlight
    const lightGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 16);
    const lightMat = new THREE.MeshPhongMaterial({ color: 0xffffcc, emissive: 0xffffee });
    const light = new THREE.Mesh(lightGeo, lightMat);
    light.rotation.x = Math.PI / 2;
    light.position.set(0, 1.1, -1.95);
    group.add(light);

    // License Plate
    const plateGeo = new THREE.PlaneGeometry(0.8, 0.3);
    const plateMat = new THREE.MeshPhongMaterial({ color: 0xffffff });
    const plate = new THREE.Mesh(plateGeo, plateMat);
    plate.position.set(0, 0.6, -2.11);
    group.add(plate);

    // Wheels
    const backWheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.5, 24);
    const frontWheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.4, 24);
    const wheelMat = new THREE.MeshPhongMaterial({ color: 0x111111 });
    
    // Front Wheel
    const fw = new THREE.Mesh(frontWheelGeo, wheelMat);
    fw.rotation.z = Math.PI / 2;
    fw.position.set(0, 0.4, -1.7);
    group.add(fw);

    // Back Wheels
    [[-1.15, 0.5, 1], [1.15, 0.5, 1]].forEach(([x, y, z]) => {
      const w = new THREE.Mesh(backWheelGeo, wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(x, y, z);
      group.add(w);
    });

    return group;
  };

  const createObstacle = (type: ObstacleType, laneIdx: number): Obstacle => {
    let mesh: THREE.Object3D;
    const lane = LANES[laneIdx];

    switch (type) {
      case 'POTHOLE':
        mesh = new THREE.Mesh(
          new THREE.CircleGeometry(1.8, 32),
          new THREE.MeshPhongMaterial({ color: 0x111111 }) 
        );
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = 0.02;
        break;
      case 'DOG':
        mesh = new THREE.Group();
        const dogColor = 0x92400E;
        const dMat = new THREE.MeshPhongMaterial({ color: dogColor });
        const dogBody = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 0.5), dMat);
        const dogHead = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), dMat);
        dogHead.position.set(-0.7, 0.4, 0);
        
        // Ears
        const earGeo = new THREE.BoxGeometry(0.1, 0.3, 0.2);
        const lEar = new THREE.Mesh(earGeo, dMat);
        lEar.position.set(-0.8, 0.7, 0.15);
        const rEar = lEar.clone();
        rEar.position.z = -0.15;
        
        const tail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.1), dMat);
        tail.position.set(0.7, 0.4, 0);
        tail.rotation.z = 0.5;
        const legGeo = new THREE.BoxGeometry(0.2, 0.4, 0.2);
        [[-0.4, -0.4, -0.15], [-0.4, -0.4, 0.15], [0.4, -0.4, -0.15], [0.4, -0.4, 0.15]].forEach(([lx, ly, lz]) => {
          const leg = new THREE.Mesh(legGeo, dMat);
          leg.position.set(lx, ly, lz);
          (mesh as THREE.Group).add(leg);
        });
        (mesh as THREE.Group).add(dogBody, dogHead, tail, lEar, rEar);
        mesh.position.y = 0.6;
        break;
      case 'HUMAN':
        mesh = new THREE.Group();
        const skinMat = new THREE.MeshPhongMaterial({ color: 0xffdbac });
        const shirtMat = new THREE.MeshPhongMaterial({ color: 0xEF4444 });
        const pantMat = new THREE.MeshPhongMaterial({ color: 0x334155 });
        const shoeMat = new THREE.MeshPhongMaterial({ color: 0x111111 });
        const hairMat = new THREE.MeshPhongMaterial({ color: 0x222222 });
        
        const h_legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.2, 0.3), pantMat);
        const h_torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.4), shirtMat);
        const h_head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 16), skinMat);
        
        // Hair
        const hair = new THREE.Mesh(new THREE.SphereGeometry(0.33, 16, 16), hairMat);
        hair.scale.set(1.05, 0.8, 1);
        hair.position.y = 0.1;
        h_head.add(hair);

        const armGeo = new THREE.BoxGeometry(0.18, 0.8, 0.18);
        const l_arm = new THREE.Mesh(armGeo, shirtMat);
        const r_arm = l_arm.clone();
        
        l_arm.position.set(-0.45, 1.5, 0);
        l_arm.rotation.z = 0.2;
        r_arm.position.set(0.45, 1.5, 0);
        r_arm.rotation.z = -0.2;
        
        const L_hand = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), skinMat);
        L_hand.position.set(0, -0.4, 0);
        l_arm.add(L_hand);
        const R_hand = L_hand.clone();
        r_arm.add(R_hand);

        const L_shoe = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.2, 0.4), shoeMat);
        L_shoe.position.set(-0.15, -0.6, 0.1);
        const R_shoe = L_shoe.clone();
        R_shoe.position.x = 0.15;
        
        h_legs.add(L_shoe, R_shoe);
        h_legs.position.y = 0.6;
        h_torso.position.y = 1.6;
        h_head.position.y = 2.35;
        
        (mesh as THREE.Group).add(h_legs, h_torso, h_head, l_arm, r_arm);
        break;
      case 'SIGN':
        mesh = new THREE.Group();
        const signBoard = new THREE.Mesh(
          new THREE.BoxGeometry(3.6, 1.3, 0.3),
          new THREE.MeshPhongMaterial({ color: 0xF97316 })
        );
        signBoard.position.y = 2.6;
        
        // Stripes on the sign
        for(let i=-1.5; i<=1.5; i+=0.8) {
            const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 1.3), new THREE.MeshPhongMaterial({ color: 0x000000 }));
            stripe.position.set(i, 0, 0.16);
            signBoard.add(stripe);
        }

        const pole1 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3), new THREE.MeshPhongMaterial({ color: 0x222222 }));
        const pole2 = pole1.clone();
        pole1.position.set(-1.4, 1.5, 0);
        pole2.position.set(1.4, 1.5, 0);
        
        // Warning light on top
        const lightBox = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshPhongMaterial({ color: 0x333333 }));
        lightBox.position.y = 3.3;
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), new THREE.MeshPhongMaterial({ color: 0xff0000, emissive: 0xff0000 }));
        bulb.position.y = 0.2;
        lightBox.add(bulb);
        
        (mesh as THREE.Group).add(signBoard, pole1, pole2, lightBox);
        break;
      default:
        mesh = new THREE.Object3D();
    }

    mesh.position.x = lane;
    mesh.position.z = -120; // Spawn far away
    mesh.castShadow = true;
    gameRef.current.scene?.add(mesh);

    return { mesh, lane: laneIdx, type };
  };

  const animate = () => {
    const { current: game } = gameRef;
    if (!game.scene || !game.renderer || !game.camera || !game.rickshaw) return;

    game.animationFrame = requestAnimationFrame(animate);

    const delta = game.clock.getDelta();
    const now = Date.now();

    // 1. Update Speed
    game.speed += SPEED_INCREMENT;
    
    // 2. Road & Lane Movement (Movement effect)
    const movement = game.speed * 85 * delta;

    game.laneLines.forEach(item => {
      item.position.z += movement;
      if (item.position.z > 40) {
        item.position.z -= 400; // Reset back to distance based on new loop (400)
      }
    });

    // 3. Spawn Obstacles
    if (now - game.lastObstacleTime > OBSTACLE_SPAWN_INTERVAL / (game.speed * 1.8)) {
      const types: ObstacleType[] = ['POTHOLE', 'DOG', 'HUMAN', 'SIGN'];
      const type = types[Math.floor(Math.random() * types.length)];
      const laneIdx = Math.floor(Math.random() * 3);
      game.obstacles.push(createObstacle(type, laneIdx));
      game.lastObstacleTime = now;
    }

    // 4. Update Obstacles & Collision
    for (let i = game.obstacles.length - 1; i >= 0; i--) {
      const obstacle = game.obstacles[i];
      obstacle.mesh.position.z += movement;

      // Collision Check
      const RickshawZ = game.rickshaw.position.z;
      const distZ = Math.abs(obstacle.mesh.position.z - RickshawZ);
      
      if (distZ < 1.8 && obstacle.lane === game.laneIndex) {
        stopGame();
        return;
      }

      // Cleanup & Score
      if (obstacle.mesh.position.z > 20) {
        game.scene.remove(obstacle.mesh);
        game.obstacles.splice(i, 1);
        setScore((prev) => prev + 1);
      }
    }

    // 5. Smooth Lane Switching
    const targetX = LANES[game.laneIndex];
    game.rickshaw.position.x += (targetX - game.rickshaw.position.x) * 0.25;
    // Dynamic tilt
    game.rickshaw.rotation.z = (game.rickshaw.position.x - targetX) * 0.15;
    game.rickshaw.rotation.y = (targetX - game.rickshaw.position.x) * 0.05;

    game.renderer.render(game.scene, game.camera);
  };

  // --- Handlers ---
  const handleKeyDown = (e: KeyboardEvent) => {
    if (gameState !== 'PLAYING') return;
    
    if (e.key.toLowerCase() === 'a' || e.key === 'ArrowLeft') {
      if (gameRef.current.laneIndex > 0) {
        gameRef.current.laneIndex--;
      }
    } else if (e.key.toLowerCase() === 'd' || e.key === 'ArrowRight') {
      if (gameRef.current.laneIndex < 2) {
        gameRef.current.laneIndex++;
      }
    }
  };

  const startGame = () => {
    setScore(0);
    setGameState('PLAYING');
    
    if (gameRef.current.renderer) {
      gameRef.current.renderer.dispose();
      if (containerRef.current?.contains(gameRef.current.renderer.domElement)) {
        containerRef.current.removeChild(gameRef.current.renderer.domElement);
      }
    }
    
    gameRef.current = {
      ...gameRef.current,
      obstacles: [],
      laneLines: [],
      speed: INITIAL_SPEED,
      laneIndex: 1,
      lastObstacleTime: 0,
    };

    initGame();
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [gameState]);

  // Handle Unmount separately
  useEffect(() => {
    return () => {
      cancelAnimationFrame(gameRef.current.animationFrame);
    };
  }, []);

  useEffect(() => {
    if (score > highScore) {
      setHighScore(score);
    }
  }, [score, highScore]);

  useEffect(() => {
    const handleResize = () => {
      if (gameRef.current.renderer && gameRef.current.camera) {
        gameRef.current.camera.aspect = window.innerWidth / window.innerHeight;
        gameRef.current.camera.updateProjectionMatrix();
        gameRef.current.renderer.setSize(window.innerWidth, window.innerHeight);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#FBBF24] font-sans">
      {/* Game Viewport */}
      <div ref={containerRef} className="absolute inset-0 bg-[#334155]" id="game-canvas" />

      {/* Top Legend (Minimal) */}
      <div className="absolute top-0 left-0 w-full p-10 flex justify-between items-start pointer-events-none z-10">
        <div className="bg-[#FBBF24] border-4 border-black shadow-[8px_8px_0px_#000000] px-8 py-4 pointer-events-auto">
          <p className="text-xs font-black uppercase tracking-widest text-black mb-1">Status</p>
          <p className="text-2xl font-black italic leading-tight">ON DUTY</p>
        </div>
        
        <div className="bg-white border-4 border-black shadow-[8px_8px_0px_#000000] px-6 py-3 pointer-events-auto">
           <p className="text-[10px] font-black uppercase text-gray-400 mb-1">Best Trip</p>
           <p className="text-xl font-black italic">₹{(highScore * 1.5).toFixed(2)}</p>
        </div>
      </div>

      {/* Rickshaw Fare Meter (Bottom Left) */}
      <div className="absolute bottom-10 left-10 pointer-events-none z-20">
        <div className="bg-[#1a1a1a] border-4 border-[#333] rounded-xl p-4 shadow-2xl flex flex-col gap-3 w-64">
           {/* Header Info */}
           <div className="flex justify-between items-center px-1">
             <span className="text-[8px] text-gray-500 font-bold uppercase tracking-tighter">Distance Kms.</span>
             <span className="text-[8px] text-gray-500 font-bold uppercase tracking-tighter">Model DTS-RP100</span>
           </div>

           {/* Distance Display */}
           <div className="bg-black/80 rounded-lg p-2 border border-white/5 flex justify-end">
             <span className="text-3xl font-digital text-red-500 leading-none tracking-widest drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]">
               {(score / 100).toFixed(2).padStart(5, '0')}
             </span>
           </div>

           {/* Fare Display Section */}
           <div className="flex gap-2 items-center">
             <div className="flex flex-col gap-1 items-center">
               <div className="w-3 h-3 rounded-full bg-green-500 shadow-[0_0_10px_#22c55e] animate-pulse" />
               <span className="text-[6px] text-green-500 font-black uppercase">Hired</span>
             </div>
             
             <div className="flex-1">
               <div className="flex justify-between px-1 mb-0.5">
                 <span className="text-[7px] text-gray-400 font-black uppercase">Fare</span>
                 <span className="text-[7px] text-gray-400 font-black uppercase">Rupees / Paise</span>
               </div>
               <div className="bg-black/90 rounded-lg p-2 border border-white/5 flex justify-end">
                 <span className="text-4xl font-digital text-red-600 leading-none tracking-widest drop-shadow-[0_0_10px_rgba(220,38,38,0.6)]">
                   {(score * 1.5).toFixed(2).padStart(6, '0')}
                 </span>
               </div>
             </div>
           </div>

           <div className="text-center pt-1 border-t border-white/10">
             <p className="text-[7px] font-black text-green-600 tracking-widest uppercase">Autorickshaw Fare Meter</p>
           </div>
        </div>
      </div>

      {/* Control Hints (Bottom Right) */}
      <div className="absolute bottom-12 right-12 flex justify-center pointer-events-none z-10">
        <div className="flex gap-6">
          <div className="bg-[#EF4444] text-white px-6 py-3 font-extrabold uppercase text-xs border-3 border-black -rotate-2 transform shadow-[4px_4px_0px_#000000]">
            A - Left
          </div>
          <div className="bg-[#3B82F6] text-white px-6 py-3 font-extrabold uppercase text-xs border-3 border-black rotate-2 transform shadow-[4px_4px_0px_#000000]">
            D - Right
          </div>
        </div>
      </div>

      {/* Game States */}
      <AnimatePresence>
        {gameState === 'START' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
          >
            <motion.div
              initial={{ scale: 0.9, rotate: -1 }}
              animate={{ scale: 1, rotate: 0 }}
              className="bg-white p-12 border-4 border-black shadow-[12px_12px_0px_#000000] max-w-md w-full text-center"
            >
              <div className="w-24 h-24 bg-yellow-400 border-4 border-black flex items-center justify-center mx-auto mb-8 shadow-[6px_6px_0px_#000000]">
                <Play className="text-black fill-black w-10 h-10 ml-1" />
              </div>
              <h1 className="text-5xl font-black italic text-gray-900 mb-4 tracking-tighter">MUMBAI RUN</h1>
              <p className="font-bold text-gray-600 mb-10 text-lg">FASTEN YOUR SEATBELT.<br/>IF YOU HAVE ONE.</p>
              
              <button
                onClick={startGame}
                className="w-full py-5 bg-black hover:bg-gray-800 text-white font-black text-xl transition-all active:translate-x-1 active:translate-y-1 active:shadow-none shadow-[6px_6px_0px_#FBBF24] border-2 border-black"
                id="start-button"
              >
                START ENGINE
              </button>
            </motion.div>
          </motion.div>
        )}

        {gameState === 'GAMEOVER' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-red-950/80 backdrop-blur-lg px-4"
          >
            <motion.div
              initial={{ scale: 0.9, rotate: 1 }}
              animate={{ scale: 1, rotate: 0 }}
              className="bg-white p-12 border-4 border-black shadow-[12px_12px_0px_#000000] max-w-sm w-full text-center"
            >
              <div className="w-24 h-24 bg-red-500 border-4 border-black flex items-center justify-center mx-auto mb-8 shadow-[6px_6px_0px_#000000] -rotate-12">
                <AlertTriangle className="text-white w-12 h-12" />
              </div>
              <h2 className="text-5xl font-black italic text-gray-900 mb-2 leading-none">CRASHED!</h2>
              <p className="font-bold text-gray-400 mb-10 uppercase tracking-widest text-xs">Meter's still running...</p>
              
              <div className="bg-gray-100 border-2 border-black p-8 mb-10 shadow-[4px_4px_0px_#000000]">
                <p className="text-[10px] uppercase font-black text-gray-400 tracking-[0.2em] mb-2">Final Meter</p>
                <p className="text-6xl font-black italic">{score}</p>
              </div>

              <button
                onClick={startGame}
                className="w-full py-5 bg-red-600 hover:bg-red-700 text-white font-black text-xl shadow-[6px_6px_0px_#000000] border-4 border-black active:translate-x-1 active:translate-y-1 active:shadow-none transition-all flex items-center justify-center gap-3"
                id="restart-button"
              >
                <RotateCcw className="w-6 h-6 stroke-[3]" />
                RETRY
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

