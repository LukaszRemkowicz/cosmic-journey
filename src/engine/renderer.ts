import * as THREE from 'three';
import { getLayerMotions, assignStarLayers } from './layers';
import { projectPointWithMotion } from './motion';
import type { MotionSettings, SceneImages } from './types';

const starVertexShader = `
  attribute vec4 uvRect;
  attribute vec3 ownerRGB;
  attribute float instanceOpacity;
  varying vec2 vUv;
  varying vec3 vOwnerRGB;
  varying float vOpacity;
  void main() {
    vUv = uvRect.xy + uv * uvRect.zw;
    vOwnerRGB = ownerRGB;
    vOpacity = instanceOpacity;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;

const starFragmentShader = `
  uniform sampler2D map;
  uniform sampler2D ownershipMap;
  uniform bool useOwnership;
  varying vec2 vUv;
  varying vec3 vOwnerRGB;
  varying float vOpacity;
  void main() {
    if (useOwnership) {
      vec3 sampledOwner = texture2D(ownershipMap, vUv).rgb;
      if (any(greaterThan(abs(sampledOwner - vOwnerRGB), vec3(0.5 / 255.0)))) discard;
    }
    vec4 color = texture2D(map, vUv);
    color.a *= vOpacity;
    gl_FragColor = color;
    #include <colorspace_fragment>
  }
`;

function makeTexture(pixels: Uint8ClampedArray, width: number, height: number): THREE.DataTexture {
  const texture = new THREE.DataTexture(
    new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength),
    width,
    height,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}

function makeOwnershipTexture(pixels: Uint8Array, width: number, height: number): THREE.DataTexture {
  const texture = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.colorSpace = THREE.NoColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}

export class StarfieldRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(0, 1, 0, 1, -100, 100);
  private readonly starlessTexture: THREE.DataTexture;
  private readonly starsTexture: THREE.DataTexture;
  private readonly starOwnershipTexture?: THREE.DataTexture;
  private readonly backgroundGeometry = new THREE.PlaneGeometry(1, 1);
  private readonly backgroundMaterial: THREE.MeshBasicMaterial;
  private readonly background: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly starGeometry?: THREE.PlaneGeometry;
  private readonly starMaterial?: THREE.ShaderMaterial;
  private readonly starMesh?: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly starOpacityAttribute?: THREE.InstancedBufferAttribute;
  private readonly images: SceneImages;
  private starLayerIndices?: Uint8Array;
  private assignedLayerCount = 0;
  private width = 1;
  private height = 1;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, images: SceneImages) {
    if (images.starless.width !== images.stars.width || images.starless.height !== images.stars.height) {
      throw new RangeError('IMAGE_DIMENSION_MISMATCH');
    }
    if (images.stars.starOwnership && images.stars.starOwnership.length !== images.stars.width * images.stars.height * 4) {
      throw new RangeError('INVALID_STAR_OWNERSHIP');
    }
    this.images = images;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.debug.onShaderError = () => { throw new Error('WEBGL_SHADER_ERROR'); };
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 1);
    const maxTextureSize = this.renderer.capabilities.maxTextureSize;
    if (images.starless.width > maxTextureSize || images.starless.height > maxTextureSize) {
      this.renderer.dispose();
      throw new RangeError('TEXTURE_TOO_LARGE');
    }

    this.starlessTexture = makeTexture(images.starless.pixels, images.starless.width, images.starless.height);
    this.starsTexture = makeTexture(images.stars.pixels, images.stars.width, images.stars.height);
    this.starOwnershipTexture = images.stars.starOwnership
      ? makeOwnershipTexture(images.stars.starOwnership, images.stars.width, images.stars.height)
      : undefined;
    this.backgroundMaterial = new THREE.MeshBasicMaterial({
      map: this.starlessTexture,
      transparent: true,
      blending: THREE.NormalBlending,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.background = new THREE.Mesh(this.backgroundGeometry, this.backgroundMaterial);
    this.scene.add(this.background);

    if (images.stars.stars.length > 0) {
      this.starGeometry = new THREE.PlaneGeometry(1, 1);
      const uvRects = new Float32Array(images.stars.stars.length * 4);
      for (let index = 0; index < images.stars.stars.length; index++) {
        const star = images.stars.stars[index];
        const offset = index * 4;
        uvRects[offset] = star.x - star.width / 2;
        uvRects[offset + 1] = star.y - star.height / 2;
        uvRects[offset + 2] = star.width;
        uvRects[offset + 3] = star.height;
      }
      this.starGeometry.setAttribute('uvRect', new THREE.InstancedBufferAttribute(uvRects, 4));
      const ownerRGB = new Uint8Array(images.stars.stars.length * 3);
      for (let index = 0; index < images.stars.stars.length; index++) {
        const id = index + 1;
        const offset = index * 3;
        ownerRGB[offset] = id & 0xff;
        ownerRGB[offset + 1] = (id >>> 8) & 0xff;
        ownerRGB[offset + 2] = (id >>> 16) & 0xff;
      }
      this.starGeometry.setAttribute('ownerRGB', new THREE.InstancedBufferAttribute(ownerRGB, 3, true));
      const opacity = new Float32Array(images.stars.stars.length).fill(1);
      this.starOpacityAttribute = new THREE.InstancedBufferAttribute(opacity, 1);
      this.starOpacityAttribute.setUsage(THREE.DynamicDrawUsage);
      this.starGeometry.setAttribute('instanceOpacity', this.starOpacityAttribute);
      this.starMaterial = new THREE.ShaderMaterial({
        uniforms: {
          map: { value: this.starsTexture },
          ownershipMap: { value: this.starOwnershipTexture ?? this.starsTexture },
          useOwnership: { value: Boolean(this.starOwnershipTexture) },
        },
        vertexShader: starVertexShader,
        fragmentShader: starFragmentShader,
        transparent: true,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
        blending: THREE.AdditiveBlending,
      });
      this.starMesh = new THREE.InstancedMesh(this.starGeometry, this.starMaterial, images.stars.stars.length);
      this.starMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.starMesh.frustumCulled = false;
      this.scene.add(this.starMesh);
    }

    this.resize(canvas.width || 1, canvas.height || 1);
  }

  resize(width: number, height: number): void {
    if (this.disposed) throw new Error('RENDERER_DISPOSED');
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
      throw new RangeError('INVALID_RENDER_SIZE');
    }
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.camera.left = 0;
    this.camera.right = width;
    this.camera.top = 0;
    this.camera.bottom = height;
    this.camera.updateProjectionMatrix();
  }

  render(progress: number, motion: MotionSettings): void {
    if (this.disposed) throw new Error('RENDERER_DISPOSED');
    const sourceWidth = this.images.starless.width;
    const sourceHeight = this.images.starless.height;
    const fitScale = Math.min(this.width / sourceWidth, this.height / sourceHeight);
    const imageWidth = sourceWidth * fitScale;
    const imageHeight = sourceHeight * fitScale;
    const offsetX = (this.width - imageWidth) / 2;
    const offsetY = (this.height - imageHeight) / 2;
    const aspectRatio = sourceWidth / sourceHeight;
    const layerMotions = getLayerMotions(progress, motion);
    const backgroundMotion = layerMotions[0];
    const backgroundCenter = projectPointWithMotion(
      0.5,
      0.5,
      backgroundMotion,
      motion.focusX,
      motion.focusY,
      aspectRatio,
    );
    this.background.position.set(
      offsetX + backgroundCenter.x * imageWidth,
      offsetY + backgroundCenter.y * imageHeight,
      0,
    );
    this.background.scale.set(imageWidth * backgroundMotion.scale, imageHeight * backgroundMotion.scale, 1);
    this.background.rotation.z = backgroundMotion.angle;

    if (this.starMesh) {
      if (this.assignedLayerCount !== motion.layerCount) {
        this.starLayerIndices = assignStarLayers(
          this.images.stars.stars,
          motion.layerCount,
        ).indices;
        this.assignedLayerCount = motion.layerCount;
      }
      const position = new THREE.Vector3();
      const scale = new THREE.Vector3();
      const rotation = new THREE.Quaternion();
      const matrix = new THREE.Matrix4();
      const axis = new THREE.Vector3(0, 0, 1);
      for (let index = 0; index < this.images.stars.stars.length; index++) {
        const star = this.images.stars.stars[index];
        const starMotion = layerMotions[this.starLayerIndices![index]];
        const center = projectPointWithMotion(
          star.x,
          star.y,
          starMotion,
          motion.focusX,
          motion.focusY,
          aspectRatio,
        );
        const shapeScale = starMotion.opacity === 0
          ? 0
          : motion.initialZoom * Math.sqrt(starMotion.scale / motion.initialZoom);
        position.set(
          offsetX + center.x * imageWidth,
          offsetY + center.y * imageHeight,
          1,
        );
        rotation.setFromAxisAngle(axis, starMotion.angle);
        scale.set(
          star.width * sourceWidth * fitScale * shapeScale,
          star.height * sourceHeight * fitScale * shapeScale,
          1,
        );
        this.starMesh.setMatrixAt(index, matrix.compose(position, rotation, scale));
        this.starOpacityAttribute!.setX(index, starMotion.opacity);
      }
      this.starMesh.instanceMatrix.needsUpdate = true;
      this.starOpacityAttribute!.needsUpdate = true;
    }

    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.starlessTexture.dispose();
    this.starsTexture.dispose();
    this.starOwnershipTexture?.dispose();
    this.backgroundGeometry.dispose();
    this.backgroundMaterial.dispose();
    this.starGeometry?.dispose();
    this.starMaterial?.dispose();
    this.renderer.dispose();
  }
}
