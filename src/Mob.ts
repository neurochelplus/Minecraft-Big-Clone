import * as THREE from 'three';
import { World } from './World';

export const MobState = {
  IDLE: 0,
  WANDER: 1,
  CHASE: 2,
  ATTACK: 3
} as const;

export type MobState = typeof MobState[keyof typeof MobState];

export class Mob {
  public mesh: THREE.Group;
  public state: MobState = MobState.IDLE;
  
  // Physics
  protected velocity = new THREE.Vector3();
  protected readonly gravity = 20.0;
  protected readonly walkSpeed: number = 2.0;
  protected isOnGround = false;

  // Dimensions (AABB)
  protected readonly width = 0.5;
  protected readonly height = 1.8;
  
  // AI
  protected stateTimer = 0;
  protected wanderAngle = 0;

  // References
  protected world: World;
  protected scene: THREE.Scene;

  // Visuals
  protected head: THREE.Mesh;
  protected body: THREE.Mesh;
  protected legs: THREE.Mesh;

  // Stats
  public hp = 20;
  public maxHp = 20;
  public isDead = false;
  public isHurt = false;

  constructor(world: World, scene: THREE.Scene, x: number, y: number, z: number) {
    this.world = world;
    this.scene = scene;
    
    this.mesh = new THREE.Group();
    (this.mesh as any).isMob = true;
    this.mesh.userData.mob = this;
    this.mesh.position.set(x, y, z);
    
    // Create Parts
    const texture = world.noiseTexture;
    
    const createBox = (w: number, h: number, d: number, colorRGB: number[], yOffset: number) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      const count = geo.attributes.position.count;
      const colors: number[] = [];
      for(let i=0; i<count; i++) colors.push(...colorRGB);
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      
      const mat = new THREE.MeshStandardMaterial({
        map: texture,
        vertexColors: true,
        roughness: 0.8
      });
      
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = yOffset;
      mesh.castShadow = true;
      return mesh;
    };

    // Zombie-like colors
    const skinColor = [0.2, 0.6, 0.2]; // Green
    const shirtColor = [0.2, 0.2, 0.8]; // Blue
    const pantsColor = [0.2, 0.2, 0.6]; // Dark Blue

    // Legs (0 to 0.7) - Center Y relative to group origin (feet)
    // BoxGeometry is centered at 0,0,0. So we move it up by height/2 + offset
    this.legs = createBox(0.4, 0.7, 0.2, pantsColor, 0.35);
    this.mesh.add(this.legs);
    
    // Body (0.7 to 1.3)
    this.body = createBox(0.5, 0.6, 0.25, shirtColor, 0.7 + 0.3);
    this.mesh.add(this.body);
    
    // Head (1.3 to 1.7)
    this.head = createBox(0.4, 0.4, 0.4, skinColor, 1.3 + 0.2);
    this.mesh.add(this.head);

    this.scene.add(this.mesh);
  }

  public takeDamage(amount: number, attackerPos: THREE.Vector3) {
    if (this.isDead || this.isHurt) return;
    
    this.hp -= amount;
    this.isHurt = true;
    
    // Red Flash Effect (persistent for 0.5s)
    this.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        if (!child.userData.originalColor) {
           child.userData.originalColor = child.material.color.clone();
        }
        child.material.color.set(0xff0000);
      }
    });

    setTimeout(() => {
        this.isHurt = false;
        if (!this.isDead) {
            this.mesh.traverse((child) => {
                if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial && child.userData.originalColor) {
                    child.material.color.copy(child.userData.originalColor);
                }
            });
        }
    }, 500);

    // Knockback
    const knockbackDir = this.mesh.position.clone().sub(attackerPos).normalize();
    knockbackDir.y = 0.4; // Slightly upward
    knockbackDir.normalize();
    
    // Apply impulse
    // We want it to fly ~1.5 blocks. With friction ~5.0, initial V should be around 8-10.
    this.velocity.add(knockbackDir.multiplyScalar(8.0));
    this.isOnGround = false;

    if (this.hp <= 0) {
      this.isDead = true;
    }
  }

  update(delta: number, playerPos?: THREE.Vector3, onAttack?: (damage: number) => void) {
    if (!this.isHurt) {
        this.updateAI(delta, playerPos, onAttack);
    }
    this.updatePhysics(delta);
  }

  protected updateAI(delta: number, _playerPos?: THREE.Vector3, _onAttack?: (damage: number) => void) {
    if (this.state === MobState.IDLE) {
      // 1% chance per frame (assuming 60fps)
      if (Math.random() < 0.01) {
        this.state = MobState.WANDER;
        this.stateTimer = 2 + Math.random(); // 2-3 seconds
        this.wanderAngle = Math.random() * Math.PI * 2;
      }
    } else if (this.state === MobState.WANDER) {
      this.stateTimer -= delta;
      if (this.stateTimer <= 0) {
        this.state = MobState.IDLE;
        this.velocity.x = 0;
        this.velocity.z = 0;
      } else {
        // Move in wander direction
        this.velocity.x = Math.sin(this.wanderAngle) * this.walkSpeed;
        this.velocity.z = Math.cos(this.wanderAngle) * this.walkSpeed;
        this.mesh.rotation.y = this.wanderAngle;
      }
    }
  }

  protected updatePhysics(delta: number) {
    // Gravity
    this.velocity.y -= this.gravity * delta;
    
    // Friction (Air resistance/Ground friction)
    // Apply when hurt (knockback) or generally to smooth movement
    // But AI overrides velocity directly, so this mainly affects Knockback (isHurt=true)
    const friction = 5.0; 
    this.velocity.x -= this.velocity.x * friction * delta;
    this.velocity.z -= this.velocity.z * friction * delta;
    
    // X Movement
    const dx = this.velocity.x * delta;
    this.mesh.position.x += dx;
    if (this.checkCollision()) {
      this.mesh.position.x -= dx;
      this.onHorizontalCollision();
    }

    // Z Movement
    const dz = this.velocity.z * delta;
    this.mesh.position.z += dz;
    if (this.checkCollision()) {
      this.mesh.position.z -= dz;
      this.onHorizontalCollision();
    }

    // Y Movement
    this.mesh.position.y += this.velocity.y * delta;
    this.isOnGround = false;
    
    if (this.checkCollision()) {
        if (this.velocity.y < 0) {
            // Landed
            this.isOnGround = true;
            this.mesh.position.y -= this.velocity.y * delta;
            // Align to surface (blocks are integers)
            this.mesh.position.y = Math.round(this.mesh.position.y);
        } else {
            // Hit head
             this.mesh.position.y -= this.velocity.y * delta;
        }
        this.velocity.y = 0;
    }

    // Void floor
    if (this.mesh.position.y < -50) {
        this.mesh.position.set(8, 20, 20);
        this.velocity.set(0,0,0);
    }
  }

  protected onHorizontalCollision() {
    // Hook for subclasses
  }

  protected checkCollision(): boolean {
    const halfW = this.width / 2;
    const pos = this.mesh.position;
    
    const minX = Math.floor(pos.x - halfW);
    const maxX = Math.floor(pos.x + halfW);
    const minY = Math.floor(pos.y);
    const maxY = Math.floor(pos.y + this.height);
    const minZ = Math.floor(pos.z - halfW);
    const maxZ = Math.floor(pos.z + halfW);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (this.world.hasBlock(x, y, z)) {
            // Using logic from World.ts (blocks are 0..1 relative to index)
            const blockMinX = x;
            const blockMaxX = x + 1;
            const blockMinY = y;
            const blockMaxY = y + 1;
            const blockMinZ = z;
            const blockMaxZ = z + 1;

            const myMinX = pos.x - halfW;
            const myMaxX = pos.x + halfW;
            const myMinY = pos.y; // Mob pivot is at feet
            const myMaxY = pos.y + this.height;
            const myMinZ = pos.z - halfW;
            const myMaxZ = pos.z + halfW;

            if (
              myMinX < blockMaxX &&
              myMaxX > blockMinX &&
              myMinY < blockMaxY &&
              myMaxY > blockMinY &&
              myMinZ < blockMaxZ &&
              myMaxZ > blockMinZ
            ) {
              return true;
            }
          }
        }
      }
    }
    return false;
  }
}