import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';

// Block IDs
const BLOCK = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  BEDROCK: 4,
  WOOD: 5,
  LEAVES: 6
};

type Chunk = {
  mesh: THREE.Mesh;
  data: Uint8Array;
};

export class World {
  private scene: THREE.Scene;
  private chunkSize: number = 16;
  
  private chunks: Map<string, Chunk> = new Map();
  private noise2D = createNoise2D();
  public noiseTexture: THREE.DataTexture;

  // Terrain Settings
  private TERRAIN_SCALE = 50;
  private TERRAIN_HEIGHT = 8;
  private OFFSET = 4;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.noiseTexture = this.createNoiseTexture();
  }

  private createNoiseTexture(): THREE.DataTexture {
    const size = 16;
    const data = new Uint8Array(size * size * 4); // RGBA

    for (let i = 0; i < size * size; i++) {
      const stride = i * 4;
      const v = Math.floor(Math.random() * (255 - 150) + 150); // 150-255
      data[stride] = v;     // R
      data[stride + 1] = v; // G
      data[stride + 2] = v; // B
      data[stride + 3] = 255; // Alpha
    }

    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.needsUpdate = true;
    return texture;
  }

  public update(playerPos: THREE.Vector3) {
    const cx = Math.floor(playerPos.x / this.chunkSize);
    const cz = Math.floor(playerPos.z / this.chunkSize);

    const activeChunks = new Set<string>();

    // Generate 7x7 grid (radius 3)
    for (let x = cx - 3; x <= cx + 3; x++) {
      for (let z = cz - 3; z <= cz + 3; z++) {
        const key = `${x},${z}`;
        activeChunks.add(key);

        if (!this.chunks.has(key)) {
          this.generateChunk(x, z);
        }
      }
    }

    // Unload far chunks
    for (const [key, chunk] of this.chunks) {
      if (!activeChunks.has(key)) {
        this.scene.remove(chunk.mesh);
        chunk.mesh.geometry.dispose();
        (chunk.mesh.material as THREE.Material).dispose();
        this.chunks.delete(key);
      }
    }
  }

  public hasBlock(x: number, y: number, z: number): boolean {
    const cx = Math.floor(x / this.chunkSize);
    const cz = Math.floor(z / this.chunkSize);
    const key = `${cx},${cz}`;

    const chunk = this.chunks.get(key);
    if (!chunk) return false;

    // Convert to local chunk coordinates
    const localX = x - cx * this.chunkSize;
    const localZ = z - cz * this.chunkSize;
    const localY = y; // y is not chunked vertically yet

    if (localY < 0 || localY >= this.chunkSize) return false;

    const index = this.getBlockIndex(localX, localY, localZ);
    return chunk.data[index] !== BLOCK.AIR;
  }

  public getBlock(x: number, y: number, z: number): number {
    const cx = Math.floor(x / this.chunkSize);
    const cz = Math.floor(z / this.chunkSize);
    const key = `${cx},${cz}`;

    const chunk = this.chunks.get(key);
    if (!chunk) return 0; // AIR

    const localX = x - cx * this.chunkSize;
    const localZ = z - cz * this.chunkSize;
    const localY = y;

    if (localY < 0 || localY >= this.chunkSize) return 0;

    const index = this.getBlockIndex(localX, localY, localZ);
    return chunk.data[index];
  }

  public setBlock(x: number, y: number, z: number, type: number) {
    const cx = Math.floor(x / this.chunkSize);
    const cz = Math.floor(z / this.chunkSize);
    const key = `${cx},${cz}`;

    const chunk = this.chunks.get(key);
    if (!chunk) return;

    const localX = x - cx * this.chunkSize;
    const localZ = z - cz * this.chunkSize;
    const localY = y;

    if (localY < 0 || localY >= this.chunkSize) return;

    const index = this.getBlockIndex(localX, localY, localZ);
    chunk.data[index] = type;

    // Regenerate mesh
    this.scene.remove(chunk.mesh);
    chunk.mesh.geometry.dispose();
    (chunk.mesh.material as THREE.Material).dispose();

    const newMesh = this.generateChunkMesh(chunk.data, cx, cz);
    this.scene.add(newMesh);
    chunk.mesh = newMesh;
  }

  private getBlockIndex(x: number, y: number, z: number): number {
    return x + y * this.chunkSize + z * this.chunkSize * this.chunkSize;
  }

  private placeTree(data: Uint8Array, startX: number, startY: number, startZ: number) {
    const trunkHeight = Math.floor(Math.random() * 2) + 4; // 4-5 blocks

    // Trunk
    for (let y = 0; y < trunkHeight; y++) {
      const currentY = startY + y;
      if (currentY < this.chunkSize) {
        const index = this.getBlockIndex(startX, currentY, startZ);
        data[index] = BLOCK.WOOD;
      }
    }

    // Leaves
    const leavesStart = startY + trunkHeight - 2;
    for (let x = startX - 2; x <= startX + 2; x++) {
      for (let y = leavesStart; y <= leavesStart + 2; y++) {
        for (let z = startZ - 2; z <= startZ + 2; z++) {
          if (
            x >= 0 && x < this.chunkSize &&
            y >= 0 && y < this.chunkSize &&
            z >= 0 && z < this.chunkSize
          ) {
             const index = this.getBlockIndex(x, y, z);
             // Don't overwrite trunk
             if (data[index] !== BLOCK.WOOD) {
               data[index] = BLOCK.LEAVES;
             }
          }
        }
      }
    }
  }

  private generateChunk(cx: number, cz: number) {
    const data = new Uint8Array(this.chunkSize * this.chunkSize * this.chunkSize);
    const startX = cx * this.chunkSize;
    const startZ = cz * this.chunkSize;

    // 1. Generate Terrain
    for (let x = 0; x < this.chunkSize; x++) {
      for (let z = 0; z < this.chunkSize; z++) {
        const worldX = startX + x;
        const worldZ = startZ + z;

        const noiseValue = this.noise2D(worldX / this.TERRAIN_SCALE, worldZ / this.TERRAIN_SCALE);
        let height = Math.floor(noiseValue * this.TERRAIN_HEIGHT) + this.OFFSET;
        
        if (height < 1) height = 1;
        if (height >= this.chunkSize) height = this.chunkSize - 1;

        for (let y = 0; y <= height; y++) {
          let type = BLOCK.STONE;
          if (y === 0) type = BLOCK.BEDROCK;
          else if (y === height) type = BLOCK.GRASS;
          else if (y >= height - 3) type = BLOCK.DIRT;
          
          const index = this.getBlockIndex(x, y, z);
          data[index] = type;
        }
      }
    }

    // 2. Generate Trees (Second Pass)
    for (let x = 0; x < this.chunkSize; x++) {
      for (let z = 0; z < this.chunkSize; z++) {
         // Find surface height
         let height = -1;
         for (let y = this.chunkSize - 1; y >= 0; y--) {
            if (data[this.getBlockIndex(x, y, z)] !== BLOCK.AIR) {
               height = y;
               break;
            }
         }

         if (height > 0) {
            const index = this.getBlockIndex(x, height, z);
            if (data[index] === BLOCK.GRASS) {
               if (Math.random() < 0.01) {
                  this.placeTree(data, x, height + 1, z);
               }
            }
         }
      }
    }

    // 3. Generate Mesh
    const mesh = this.generateChunkMesh(data, cx, cz);
    this.scene.add(mesh);
    this.chunks.set(`${cx},${cz}`, { mesh, data });
  }

  private generateChunkMesh(data: Uint8Array, cx: number, cz: number): THREE.Mesh {
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const colors: number[] = [];

    const startX = cx * this.chunkSize;
    const startZ = cz * this.chunkSize;

    // Helper to add face
    const addFace = (x: number, y: number, z: number, type: number, side: string) => {
      // Local block coords
      const localX = x;
      const localY = y;
      const localZ = z;
      
      const x0 = localX;
      const x1 = localX + 1;
      const y0 = localY;
      const y1 = localY + 1;
      const z0 = localZ;
      const z1 = localZ + 1;

      // Color Logic
      let r = 0.5, g = 0.5, b = 0.5;
      if (type === BLOCK.STONE) { r=0.5; g=0.5; b=0.5; }
      else if (type === BLOCK.BEDROCK) { r=0.13; g=0.13; b=0.13; }
      else if (type === BLOCK.DIRT) { r=0.54; g=0.27; b=0.07; } // Brown
      else if (type === BLOCK.GRASS) {
        if (side === 'top') { r=0.33; g=0.6; b=0.33; } // Green
        else { r=0.54; g=0.27; b=0.07; } // Dirt side
      }
      else if (type === BLOCK.WOOD) { r=0.4; g=0.2; b=0.0; } // Dark Brown
      else if (type === BLOCK.LEAVES) { r=0.13; g=0.55; b=0.13; } // Forest Green

      // Append data based on side
      if (side === 'top') {
        // y+
        positions.push(x0, y1, z1,  x1, y1, z1,  x0, y1, z0,  x1, y1, z0);
        normals.push(0,1,0, 0,1,0, 0,1,0, 0,1,0);
      } else if (side === 'bottom') {
        // y-
        positions.push(x0, y0, z0,  x1, y0, z0,  x0, y0, z1,  x1, y0, z1);
        normals.push(0,-1,0, 0,-1,0, 0,-1,0, 0,-1,0);
      } else if (side === 'front') {
        // z+
        positions.push(x0, y0, z1,  x1, y0, z1,  x0, y1, z1,  x1, y1, z1);
        normals.push(0,0,1, 0,0,1, 0,0,1, 0,0,1);
      } else if (side === 'back') {
        // z-
        positions.push(x1, y0, z0,  x0, y0, z0,  x1, y1, z0,  x0, y1, z0);
        normals.push(0,0,-1, 0,0,-1, 0,0,-1, 0,0,-1);
      } else if (side === 'right') {
        // x+
        positions.push(x1, y0, z1,  x1, y0, z0,  x1, y1, z1,  x1, y1, z0);
        normals.push(1,0,0, 1,0,0, 1,0,0, 1,0,0);
      } else if (side === 'left') {
        // x-
        positions.push(x0, y0, z0,  x0, y0, z1,  x0, y1, z0,  x0, y1, z1);
        normals.push(-1,0,0, -1,0,0, -1,0,0, -1,0,0);
      }

      // UVs (Simple 0-1)
      uvs.push(0,0, 1,0, 0,1, 1,1);

      // Colors (4 vertices per face)
      for(let i=0; i<4; i++) colors.push(r,g,b);
    };

    // Iterate
    for (let x = 0; x < this.chunkSize; x++) {
      for (let y = 0; y < this.chunkSize; y++) {
        for (let z = 0; z < this.chunkSize; z++) {
          const index = this.getBlockIndex(x, y, z);
          const type = data[index];
          
          if (type === BLOCK.AIR) continue;

          // Check neighbors
          // Top
          if (y === this.chunkSize - 1 || data[this.getBlockIndex(x, y+1, z)] === BLOCK.AIR) {
            addFace(x, y, z, type, 'top');
          }
          // Bottom
          if (y === 0 || data[this.getBlockIndex(x, y-1, z)] === BLOCK.AIR) {
            addFace(x, y, z, type, 'bottom');
          }
          // Front (z+)
          if (z === this.chunkSize - 1 || data[this.getBlockIndex(x, y, z+1)] === BLOCK.AIR) {
            addFace(x, y, z, type, 'front');
          }
          // Back (z-)
          if (z === 0 || data[this.getBlockIndex(x, y, z-1)] === BLOCK.AIR) {
            addFace(x, y, z, type, 'back');
          }
          // Right (x+)
          if (x === this.chunkSize - 1 || data[this.getBlockIndex(x+1, y, z)] === BLOCK.AIR) {
            addFace(x, y, z, type, 'right');
          }
          // Left (x-)
          if (x === 0 || data[this.getBlockIndex(x-1, y, z)] === BLOCK.AIR) {
            addFace(x, y, z, type, 'left');
          }
        }
      }
    }

    const geometry = new THREE.BufferGeometry();
    const indices: number[] = [];
    
    // Convert quads (4 verts) to triangles (6 indices)
    const vertCount = positions.length / 3;
    for (let i = 0; i < vertCount; i += 4) {
      indices.push(i, i+1, i+2);
      indices.push(i+2, i+1, i+3);
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere(); // Important for culling

    const material = new THREE.MeshStandardMaterial({ 
      map: this.noiseTexture,
      vertexColors: true,
      roughness: 0.8
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(startX, 0, startZ);
    
    return mesh;
  }
}
