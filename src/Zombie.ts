import * as THREE from 'three';
import { Mob, MobState } from './Mob';

export class Zombie extends Mob {
  
  // Slower than player (Player is usually faster, let's say Zombie is 3.5, Player ~5-6)
  protected readonly walkSpeed: number = 1.75; 
  private lastAttackTime = 0;
  
  // Arms
  private leftArm: THREE.Mesh;
  private rightArm: THREE.Mesh;

  constructor(world: any, scene: THREE.Scene, x: number, y: number, z: number) {
      super(world, scene, x, y, z);
      
      const texture = world.noiseTexture;
      const skinColor = [0.2, 0.6, 0.2]; // Green
      
      const createArm = (xOffset: number) => {
          const geo = new THREE.BoxGeometry(0.2, 0.7, 0.2);
          const count = geo.attributes.position.count;
          const colors: number[] = [];
          for(let i=0; i<count; i++) colors.push(...skinColor);
          geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
          
          const mat = new THREE.MeshStandardMaterial({
            map: texture,
            vertexColors: true,
            roughness: 0.8
          });
          
          const mesh = new THREE.Mesh(geo, mat);
          // Pivot at shoulder (approx 1.15 height)
          mesh.position.set(xOffset, 1.15, 0.4); 
          // Default pose: arms forward ("Zombie pose")
          mesh.rotation.x = -Math.PI / 2; 
          return mesh;
      };

      this.leftArm = createArm(-0.35);
      this.rightArm = createArm(0.35);
      
      this.mesh.add(this.leftArm);
      this.mesh.add(this.rightArm);
  }

  protected updateAI(delta: number, playerPos?: THREE.Vector3, onAttack?: (damage: number) => void) {
    // Animation: bob arms
    const time = performance.now() / 1000;
    const isMoving = this.velocity.lengthSq() > 0.1;
    
    if (isMoving) {
        // Simple bobbing when moving
        this.leftArm.rotation.x = -Math.PI / 2 + Math.sin(time * 10) * 0.1;
        this.rightArm.rotation.x = -Math.PI / 2 - Math.sin(time * 10) * 0.1;
    } else {
        // Idle breathing
        this.leftArm.rotation.x = -Math.PI / 2 + Math.sin(time * 2) * 0.05;
        this.rightArm.rotation.x = -Math.PI / 2 + Math.sin(time * 2 + 1) * 0.05;
    }

    if (!playerPos) {
      super.updateAI(delta);
      return;
    }

    const dist = this.mesh.position.distanceTo(playerPos);

    // AI State Logic with Hysteresis
    if (this.state !== MobState.CHASE && dist < 15) {
      this.state = MobState.CHASE;
    } else if (this.state === MobState.CHASE && dist > 20) {
      this.state = MobState.IDLE;
      // Reset velocity when losing aggro
      this.velocity.x = 0;
      this.velocity.z = 0;
    }

    if (this.state === MobState.CHASE) {
      // Look at player (only Y rotation)
      const dx = playerPos.x - this.mesh.position.x;
      const dz = playerPos.z - this.mesh.position.z;
      const angle = Math.atan2(dx, dz);
      this.mesh.rotation.y = angle;

      // Base movement
      // Stop at 2.0m (just inside attack range)
      if (dist > 2.0) {
          this.velocity.x = Math.sin(angle) * this.walkSpeed;
          this.velocity.z = Math.cos(angle) * this.walkSpeed;
      } else {
          // Stop but keep looking
          this.velocity.x = 0;
          this.velocity.z = 0;
      }

      // Separation (Push back if too close)
      // Hard collision boundary at 1.5 units
      if (dist < 1.5) {
        const pushDir = this.mesh.position.clone().sub(playerPos).normalize();
        const pushSpeed = 5.0; // Stronger push
        this.velocity.x += pushDir.x * pushSpeed;
        this.velocity.z += pushDir.z * pushSpeed;
      }

      // Attack Logic
      // Attack range (2.2) > Stopping distance (2.0)
      if (dist < 2.2) {
        const now = performance.now();
        if (now - this.lastAttackTime > 1500) { // 1.5 second cooldown
            this.state = MobState.ATTACK;
            // console.log('Зомби ударил игрока');
            if (onAttack) onAttack(2); // Deal 2 damage
            
            // Attack animation punch
            this.leftArm.rotation.x -= 0.5;
            this.rightArm.rotation.x -= 0.5;
            
            this.lastAttackTime = now;
        }
      }
    } else {
      // Default wander
      super.updateAI(delta);
    }
  }

  protected onHorizontalCollision() {
    if (this.isOnGround) {
        // Simple auto-jump check:
        // We hit a wall. Is the block ABOVE that wall empty?
        
        // Calculate point in front of zombie
        const direction = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.mesh.rotation.y);
        const checkDist = 0.8; // Slightly ahead
        const checkPos = this.mesh.position.clone().add(direction.multiplyScalar(checkDist));
        
        const x = Math.floor(checkPos.x);
        const z = Math.floor(checkPos.z);
        const y = Math.floor(this.mesh.position.y); // Current foot level

        // Block at feet level is solid (we collided)
        // Check block at head level (y+1)
        if (!this.world.hasBlock(x, y + 1, z) && !this.world.hasBlock(x, y + 2, z)) {
            // Space to jump!
            // Calculate jump impulse sqrt(2 * g * h) -> h=1.25 -> ~7
            this.velocity.y = Math.sqrt(2 * 20.0 * 1.25);
            this.isOnGround = false;
        }
    }
  }
}