import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { World } from './World';
import { ItemEntity } from './ItemEntity';
import { Mob } from './Mob';
import { Zombie } from './Zombie';
import { MobManager } from './MobManager';
import './style.css';

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb); // Sky blue
scene.fog = new THREE.Fog(0x87ceeb, 10, 50);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(8, 20, 20);
camera.lookAt(8, 8, 8);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// Lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(20, 50, 20);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
scene.add(dirLight);

// Controls
const controls = new PointerLockControls(camera, document.body);

const blocker = document.getElementById('blocker')!;
const instructions = document.getElementById('instructions')!;

instructions.addEventListener('click', () => {
  if (!isInventoryOpen) {
    controls.lock();
  }
});

controls.addEventListener('lock', () => {
  instructions.style.display = 'none';
  blocker.style.display = 'none';
  if (isInventoryOpen) toggleInventory(); // Close inventory if locking (e.g. clicking back in)
});

controls.addEventListener('unlock', () => {
  if (!isInventoryOpen) {
    blocker.style.display = 'flex';
    instructions.style.display = 'block';
  }
});

scene.add(controls.object);

// Movement variables
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let isOnGround = false;

const GRAVITY = 20.0;
const JUMP_HEIGHT = 1.25;
const JUMP_IMPULSE = Math.sqrt(2 * GRAVITY * JUMP_HEIGHT);

const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();

const onKeyDown = (event: KeyboardEvent) => {
  switch (event.code) {
    case 'ArrowUp':
    case 'KeyW':
      moveForward = true;
      break;
    case 'ArrowLeft':
    case 'KeyA':
      moveLeft = true;
      break;
    case 'ArrowDown':
    case 'KeyS':
      moveBackward = true;
      break;
    case 'ArrowRight':
    case 'KeyD':
      moveRight = true;
      break;
    case 'Space':
      if (isOnGround) {
        velocity.y = JUMP_IMPULSE;
        isOnGround = false;
      }
      break;
    case 'KeyE':
      toggleInventory();
      break;
  }
};

const onKeyUp = (event: KeyboardEvent) => {
  switch (event.code) {
    case 'ArrowUp':
    case 'KeyW':
      moveForward = false;
      break;
    case 'ArrowLeft':
    case 'KeyA':
      moveLeft = false;
      break;
    case 'ArrowDown':
    case 'KeyS':
      moveBackward = false;
      break;
    case 'ArrowRight':
    case 'KeyD':
      moveRight = false;
      break;
  }
};

document.addEventListener('keydown', onKeyDown);
document.addEventListener('keyup', onKeyUp);

// World Generation
const world = new World(scene);
const entities: ItemEntity[] = [];
const mobManager = new MobManager(world, scene, entities);

// Block Data
const BLOCK_NAMES: Record<number, string> = {
  1: 'Блок травы',
  2: 'Земля',
  3: 'Камень',
  4: 'Бедрок',
  5: 'Дерево',
  6: 'Листва'
};

// Inventory State
const inventorySlots = Array.from({ length: 36 }, () => ({ id: 0, count: 0 }));
let selectedSlot = 0;
let isInventoryOpen = false;

// Drag and Drop State
let draggedItem: { id: number, count: number } | null = null;
const dragIcon = document.getElementById('drag-icon')!;

// UI Elements
const hotbarContainer = document.getElementById('hotbar')!;
const inventoryMenu = document.getElementById('inventory-menu')!;
const inventoryGrid = document.getElementById('inventory-grid')!;
const tooltip = document.getElementById('tooltip')!;
const hotbarLabel = document.getElementById('hotbar-label')!;

let hotbarLabelTimeout: number;

// Generate CSS Noise
const canvas = document.createElement('canvas');
canvas.width = 64;
canvas.height = 64;
const ctx = canvas.getContext('2d')!;
for (let i = 0; i < 64 * 64; i++) {
  const x = i % 64;
  const y = Math.floor(i / 64);
  const v = Math.floor(Math.random() * 50 + 200); // Light noise
  ctx.fillStyle = `rgba(${v},${v},${v},0.5)`; // Semi-transparent
  ctx.fillRect(x, y, 1, 1);
}
document.body.style.setProperty('--noise-url', `url(${canvas.toDataURL()})`);

function getBlockColor(id: number) {
  if (id === 1) return '#559955';
  if (id === 2) return '#8B4513';
  if (id === 3) return '#808080';
  if (id === 5) return '#654321';
  if (id === 6) return '#228B22';
  return '#fff';
}

function showHotbarLabel(text: string) {
  hotbarLabel.innerText = text;
  hotbarLabel.style.opacity = '1';
  clearTimeout(hotbarLabelTimeout);
  hotbarLabelTimeout = setTimeout(() => {
    hotbarLabel.style.opacity = '0';
  }, 2000);
}

function createSlotElement(slot: { id: number, count: number }, index: number, isHotbar: boolean) {
  const div = document.createElement('div');
  div.classList.add('slot');
  if (isHotbar && index === selectedSlot) div.classList.add('active');
  
  if (slot.id !== 0 && slot.count > 0) {
    const colorDiv = document.createElement('div');
    colorDiv.classList.add('block-icon');
    colorDiv.style.backgroundColor = getBlockColor(slot.id);
    div.appendChild(colorDiv);

    const countDiv = document.createElement('div');
    countDiv.classList.add('slot-count');
    countDiv.innerText = slot.count.toString();
    div.appendChild(countDiv);

    // Tooltip Events
    div.addEventListener('mouseenter', () => {
      if (isInventoryOpen && slot.id !== 0) {
        tooltip.innerText = BLOCK_NAMES[slot.id] || 'Блок';
        tooltip.style.display = 'block';
      }
    });
    
    div.addEventListener('mousemove', (e) => {
      if (isInventoryOpen) {
        tooltip.style.left = (e.clientX + 10) + 'px';
        tooltip.style.top = (e.clientY + 10) + 'px';
      }
    });

    div.addEventListener('mouseleave', () => {
      tooltip.style.display = 'none';
    });
  }

  // Click handler for inventory interaction
  div.addEventListener('mousedown', (e) => {
    e.stopPropagation(); // Prevent game interaction
    if (isInventoryOpen) {
      handleSlotClick(index);
    }
  });

  return div;
}

function updateHotbarUI() {
  hotbarContainer.innerHTML = '';
  // Only first 9 slots
  for (let i = 0; i < 9; i++) {
    const slotEl = createSlotElement(inventorySlots[i], i, true);
    hotbarContainer.appendChild(slotEl);
  }
}

function updateInventoryUI() {
  inventoryGrid.innerHTML = '';
  // Main Inventory (9-35)
  for (let i = 9; i < 36; i++) {
    inventoryGrid.appendChild(createSlotElement(inventorySlots[i], i, false));
  }
  
  // Separator/Spacer
  const separator = document.createElement('div');
  separator.className = 'slot-hotbar-separator';
  separator.style.gridColumn = '1 / -1';
  inventoryGrid.appendChild(separator);

  // Hotbar (0-8)
  for (let i = 0; i < 9; i++) {
    inventoryGrid.appendChild(createSlotElement(inventorySlots[i], i, false));
  }
}

function toggleInventory() {
  isInventoryOpen = !isInventoryOpen;
  
  if (isInventoryOpen) {
    controls.unlock();
    inventoryMenu.style.display = 'flex';
    updateInventoryUI();
  } else {
    controls.lock();
    inventoryMenu.style.display = 'none';
    tooltip.style.display = 'none'; // Hide tooltip on close
    
    if (draggedItem) {
      // Put dragged item back
      for (let i = 0; i < 36; i++) {
        if (inventorySlots[i].id === 0) {
          inventorySlots[i] = draggedItem;
          break;
        } else if (inventorySlots[i].id === draggedItem.id) {
            inventorySlots[i].count += draggedItem.count;
            break;
        }
      }
      draggedItem = null;
      updateDragIcon();
    }
  }
}

function handleSlotClick(index: number) {
  const slot = inventorySlots[index];

  if (!draggedItem) {
    if (slot.id !== 0) {
      draggedItem = { ...slot };
      slot.id = 0;
      slot.count = 0;
    }
  } else {
    if (slot.id === 0) {
      slot.id = draggedItem.id;
      slot.count = draggedItem.count;
      draggedItem = null;
    } else if (slot.id === draggedItem.id) {
      slot.count += draggedItem.count;
      draggedItem = null;
    } else {
      const temp = { ...slot };
      slot.id = draggedItem.id;
      slot.count = draggedItem.count;
      draggedItem = temp;
    }
  }
  
  updateInventoryUI();
  updateHotbarUI();
  updateDragIcon();
}

function updateDragIcon() {
  dragIcon.innerHTML = '';
  if (draggedItem && draggedItem.id !== 0) {
    dragIcon.style.display = 'block';
    const icon = document.createElement('div');
    icon.className = 'block-icon';
    icon.style.width = '32px';
    icon.style.height = '32px';
    icon.style.backgroundColor = getBlockColor(draggedItem.id);
    
    const count = document.createElement('div');
    count.className = 'slot-count';
    count.style.fontSize = '12px';
    count.innerText = draggedItem.count.toString();
    
    icon.appendChild(count);
    dragIcon.appendChild(icon);
  } else {
    dragIcon.style.display = 'none';
  }
}

window.addEventListener('mousemove', (e) => {
  if (draggedItem) {
    dragIcon.style.left = e.clientX + 'px';
    dragIcon.style.top = e.clientY + 'px';
  }
});

updateHotbarUI();

function onHotbarChange() {
  updateHotbarUI();
  const slot = inventorySlots[selectedSlot];
  if (slot && slot.id !== 0) {
    showHotbarLabel(BLOCK_NAMES[slot.id] || 'Unknown Block');
  } else {
    hotbarLabel.style.opacity = '0';
  }
}

window.addEventListener('wheel', (event) => {
  if (event.deltaY > 0) {
    selectedSlot = (selectedSlot + 1) % 9;
  } else {
    selectedSlot = (selectedSlot - 1 + 9) % 9;
  }
  onHotbarChange();
});

window.addEventListener('keydown', (event) => {
  const key = parseInt(event.key);
  if (key >= 1 && key <= 9) {
    selectedSlot = key - 1;
    onHotbarChange();
  }
});

// Interaction
const raycaster = new THREE.Raycaster();
const cursorGeometry = new THREE.BoxGeometry(1.01, 1.01, 1.01);
const cursorMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, wireframe: true });
const cursorMesh = new THREE.Mesh(cursorGeometry, cursorMaterial);
cursorMesh.visible = false;
scene.add(cursorMesh);

// Player Health System
let playerHP = 20;
let isInvulnerable = false;
const damageOverlay = document.getElementById('damage-overlay')!;
const healthBar = document.getElementById('health-bar')!;

// Init Health Bar
for (let i = 0; i < 20; i++) {
  const div = document.createElement('div');
  div.className = 'hp-unit';
  healthBar.appendChild(div);
}

function updateHealthUI() {
  const units = healthBar.children;
  for (let i = 0; i < 20; i++) {
    const unit = units[i] as HTMLElement;
    if (i < playerHP) {
      unit.classList.remove('empty');
    } else {
      unit.classList.add('empty');
    }
  }
}

function takeDamage(amount: number) {
  if (isInvulnerable) return;

  playerHP -= amount;
  if (playerHP < 0) playerHP = 0;
  updateHealthUI();
  
  isInvulnerable = true;
  
  // Red Flash Effect
  damageOverlay.style.transition = 'none';
  damageOverlay.style.opacity = '0.3';
  
  // Camera Shake
  const originalPos = camera.position.clone();
  const shakeIntensity = 0.2;
  
  // Apply shake
  camera.position.x += (Math.random() - 0.5) * shakeIntensity;
  camera.position.y += (Math.random() - 0.5) * shakeIntensity;
  camera.position.z += (Math.random() - 0.5) * shakeIntensity;
  
  // Verify valid position
  if (checkCollision(camera.position)) {
    camera.position.copy(originalPos);
  }
  
  // Restore
  requestAnimationFrame(() => {
     damageOverlay.style.transition = 'opacity 0.5s ease-out';
     damageOverlay.style.opacity = '0';
  });

  if (playerHP <= 0) {
    respawn();
  }

  setTimeout(() => {
    isInvulnerable = false;
  }, 500);
}

function respawn() {
  playerHP = 20;
  updateHealthUI();
  isInvulnerable = false;
  
  // Teleport to spawn
  controls.object.position.set(8, 20, 8);
  velocity.set(0, 0, 0);
  
  console.log("Respawned!");
}

document.addEventListener('mousedown', (event) => {
  if (!controls.isLocked) return;
  if (isInventoryOpen) return;
  
  // 1. Check for Mob Hit
  if (event.button === 0) { // Left Click
     raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
     const intersects = raycaster.intersectObjects(scene.children, true); // Recursive to hit mob parts
     
     // Find first mob hit
     const mobHit = intersects.find(i => {
         // Check if object or any parent is a mob
         let obj = i.object;
         while(obj) {
             if (obj.userData && obj.userData.mob) return true;
             obj = obj.parent!;
         }
         return false;
     });

     if (mobHit && mobHit.distance < 4.0) { // Attack range 4.0
         let obj = mobHit.object;
         while(obj && !obj.userData.mob) {
             obj = obj.parent!;
         }
         if (obj && obj.userData.mob) {
             obj.userData.mob.takeDamage(5, controls.object.position); // Deal 5 damage
             
             // Attack animation (camera bob)
             camera.position.y -= 0.1; 
             setTimeout(() => camera.position.y += 0.1, 100);
             return; // Don't break blocks if we hit a mob
         }
     }
  }
  
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const intersects = raycaster.intersectObjects(scene.children);
  const hit = intersects.find(i => i.object !== cursorMesh && i.object !== controls.object && (i.object as any).isMesh && !(i.object as any).isItem && !(i.object.parent as any)?.isMob);

  if (hit && hit.distance < 6) {
    if (event.button === 0) {
      // Break Block
      const p = hit.point.clone().add(raycaster.ray.direction.clone().multiplyScalar(0.1));
      const x = Math.floor(p.x);
      const y = Math.floor(p.y);
      const z = Math.floor(p.z);
      
      const blockId = world.getBlock(x, y, z);
      if (blockId !== 0) {
        entities.push(new ItemEntity(world, scene, x, y, z, blockId, world.noiseTexture));
        world.setBlock(x, y, z, 0); // AIR
      }
    } else if (event.button === 2) {
      // Place Block
      const slot = inventorySlots[selectedSlot];
      if (slot.id !== 0 && slot.count > 0) {
        if (hit.face) {
          const p = hit.point.clone().add(hit.face.normal.clone().multiplyScalar(0.1));
          const x = Math.floor(p.x);
          const y = Math.floor(p.y);
          const z = Math.floor(p.z);
          
          world.setBlock(x, y, z, slot.id);
          
          // Decrement Inventory
          slot.count--;
          if (slot.count <= 0) {
            slot.id = 0;
            slot.count = 0;
          }
          updateHotbarUI();
          if (isInventoryOpen) updateInventoryUI();
        }
      }
    }
  }
});

const playerHalfWidth = 0.3;
const playerHeight = 1.8;
const eyeHeight = 1.7;

function checkCollision(position: THREE.Vector3): boolean {
  const minX = Math.floor(position.x - playerHalfWidth);
  const maxX = Math.floor(position.x + playerHalfWidth);
  const minY = Math.floor(position.y - eyeHeight);
  const maxY = Math.floor(position.y - eyeHeight + playerHeight);
  const minZ = Math.floor(position.z - playerHalfWidth);
  const maxZ = Math.floor(position.z + playerHalfWidth);

  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        if (world.hasBlock(x, y, z)) {
          // Precise AABB check
          // Block AABB (blocks are centered at integer coordinates)
          const blockMinX = x - 0.5;
          const blockMaxX = x + 0.5;
          const blockMinY = y - 0.5;
          const blockMaxY = y + 0.5;
          const blockMinZ = z - 0.5;
          const blockMaxZ = z + 0.5;

          // Player AABB
          const playerMinX = position.x - playerHalfWidth;
          const playerMaxX = position.x + playerHalfWidth;
          const playerMinY = position.y - eyeHeight;
          const playerMaxY = position.y - eyeHeight + playerHeight;
          const playerMinZ = position.z - playerHalfWidth;
          const playerMaxZ = position.z + playerHalfWidth;

          if (
            playerMinX < blockMaxX &&
            playerMaxX > blockMinX &&
            playerMinY < blockMaxY &&
            playerMaxY > blockMinY &&
            playerMinZ < blockMaxZ &&
            playerMaxZ > blockMinZ
          ) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

// Animation Loop
let prevTime = performance.now();

function animate() {
  requestAnimationFrame(animate);

  world.update(controls.object.position);
  
  const time = performance.now();
  const delta = (time - prevTime) / 1000;
  
  // Update Entities & Pickup
  for (let i = entities.length - 1; i >= 0; i--) {
    const entity = entities[i];
    entity.update(time / 1000, delta);

    if (entity.isDead) {
      entities.splice(i, 1);
      continue;
    }

    if (entity.mesh.position.distanceTo(controls.object.position) < 1.5) {
      // Pickup logic
      const type = entity.type;
      
      // 1. Try to find existing slot with same type
      let targetSlot = inventorySlots.find(s => s.id === type);
      
      // 2. If not found, find first empty slot
      if (!targetSlot) {
        targetSlot = inventorySlots.find(s => s.id === 0);
        if (targetSlot) {
            targetSlot.id = type;
            targetSlot.count = 0;
        }
      }

      // 3. Add to slot if found
      if (targetSlot) {
        targetSlot.count++;
        entity.dispose();
        entities.splice(i, 1);
        
        // Update Hotbar label if picking up to active slot
        if (targetSlot === inventorySlots[selectedSlot]) {
            onHotbarChange();
        } else {
            updateHotbarUI();
        }
        
        if (isInventoryOpen) updateInventoryUI();
      }
    }
  }

  // Update Mob Manager
  mobManager.update(delta, controls.object.position, takeDamage);

  // Cursor Update
  if (controls.isLocked) {
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const intersects = raycaster.intersectObjects(scene.children);
    const hit = intersects.find(i => i.object !== cursorMesh && i.object !== controls.object && (i.object as any).isMesh && !(i.object as any).isItem && !(i.object.parent as any)?.isMob);

    if (hit && hit.distance < 6) {
      cursorMesh.visible = true;
      const p = hit.point.clone().add(raycaster.ray.direction.clone().multiplyScalar(0.1));
      cursorMesh.position.set(
        Math.floor(p.x) + 0.5,
        Math.floor(p.y) + 0.5,
        Math.floor(p.z) + 0.5
      );
    } else {
      cursorMesh.visible = false;
    }
  }
  
  if (controls.isLocked) {
    velocity.x -= velocity.x * 10.0 * delta;
    velocity.z -= velocity.z * 10.0 * delta;
    velocity.y -= GRAVITY * delta; // Gravity

    direction.z = Number(moveForward) - Number(moveBackward);
    direction.x = Number(moveRight) - Number(moveLeft);
    direction.normalize();

    if (moveForward || moveBackward) velocity.z -= direction.z * 50.0 * delta;
    if (moveLeft || moveRight) velocity.x -= direction.x * 50.0 * delta;

    // Apply movements separately to handle collisions
    
    // X Axis
    const dx = -velocity.x * delta;
    controls.moveRight(dx);
    if (checkCollision(controls.object.position)) {
      controls.moveRight(-dx); // Revert
      velocity.x = 0;
    }

    // Z Axis (Forward/Backward)
    const dz = -velocity.z * delta;
    controls.moveForward(dz);
    if (checkCollision(controls.object.position)) {
      controls.moveForward(-dz); // Revert
      velocity.z = 0;
    }

    // Y Axis
    controls.object.position.y += velocity.y * delta;
    
    // Assume we are in air until we hit ground
    isOnGround = false;

    if (checkCollision(controls.object.position)) {
      // Collision detected on Y axis
      if (velocity.y < 0) {
        // Falling, hit ground
        isOnGround = true;
        controls.object.position.y -= velocity.y * delta;
        velocity.y = 0;
      } else {
        // Jumping, hit ceiling
        controls.object.position.y -= velocity.y * delta;
        velocity.y = 0;
      }
    }
    
    // Fallback for falling out of world
    if (controls.object.position.y < -50) {
        controls.object.position.set(8, 20, 20);
        velocity.set(0, 0, 0);
    }
  }

  prevTime = time;

  renderer.render(scene, camera);
}

// Window resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();