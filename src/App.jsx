import { Canvas } from '@react-three/fiber';
import { OrbitControls, useFBX, Loader, Line, OrthographicCamera } from '@react-three/drei';
import { useRef, useEffect, Suspense } from 'react';
import { useControls } from 'leva';
import { AnimationMixer, LoopRepeat, Vector3, TextureLoader } from 'three';
import { Leva } from 'leva';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { useState } from 'react';
import * as YUKA from 'yuka';







class Fish extends YUKA.Vehicle {
  constructor() {
    super();
    
    // Configure vehicle properties
    this.maxSpeed = 10;
    this.maxForce = 100;
    
    // Set initial velocity to prevent stalling
    this.velocity.set(0.1, 0, 0);
    
    // Configure wander behavior with more pronounced parameters
    this.wanderBehavior = new YUKA.WanderBehavior();
    this.wanderBehavior.jitter = 0.8;    // Increase randomness
    this.wanderBehavior.radius = 4;      // Larger radius for wider turns
    this.wanderBehavior.distance = 10;    // Look further ahead
    this.wanderBehavior.weight = 1;
    
    // Add behavior to steering
    this.steering.add(this.wanderBehavior);
  }
}


const FISH_STATES = {
  SWIMMING: 'SWIMMING',
  IDLE: 'IDLE',
  // Add more states as needed
};

const getRandomTarget = (radius) => {
  const angle = Math.random() * Math.PI * 2;
  const distance = Math.random() * radius;
  const x = Math.cos(angle) * distance;
  const z = Math.sin(angle) * distance;
  return new Vector3(x, 0, z);
};

const Model = ({ url }) => {
  // Keep only essential refs
  const modelRef = useRef();

  // Load textures
  const diffuseMap = useLoader(TextureLoader, '/models/textures/koi_showa_diff.png');
  const bumpMap = useLoader(TextureLoader, '/models/textures/koi_showa_bump.png');
  const specularMap = useLoader(TextureLoader, '/models/textures/koi_showa_spec.png');

  // Apply textures when model loads
  useEffect(() => {
    if (!modelRef.current) return;

    // Traverse the model to find meshes
    modelRef.current.traverse((child) => {
      if (child.isMesh) {
        child.material = new THREE.MeshStandardMaterial({
          map: diffuseMap,
          bumpMap: bumpMap,
          bumpScale: 0.05,
          roughnessMap: specularMap,
          roughness: 0.5,
          metalness: 0.2,
          envMapIntensity: 1,
        });

        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }, [diffuseMap, bumpMap, specularMap]);

  // Load the FBX model
  const fbx = useFBX(url);

  // Position and direction refs for YUKA
  const position = useRef(new THREE.Vector3());
  const fishAI = useRef();
  const entityManager = useRef(new YUKA.EntityManager());
  const time = useRef(new YUKA.Time());

  // Initialize AI and model
  useEffect(() => {
    if (!modelRef.current) return;

    fishAI.current = new Fish();
    fishAI.current.position.copy(position.current);
    
    const sync = (entity, renderComponent) => {
      renderComponent.position.copy(entity.position);
      
      if (entity.velocity.length() > 0.001) {
        const direction = entity.velocity.clone().normalize();
        const angle = Math.atan2(direction.x, direction.z);
        const euler = new THREE.Euler(0, angle, 0);
        renderComponent.quaternion.setFromEuler(euler);
      }
    };

    fishAI.current.setRenderComponent(modelRef.current, sync);
    entityManager.current.add(fishAI.current);
    
    return () => {
      entityManager.current.clear();
    };
  }, []);

  // Simple update for YUKA movement
  useFrame(() => {
    if (!modelRef.current || !fishAI.current) return;
    const deltaTime = time.current.update().getDelta();
    entityManager.current.update(deltaTime);
  });

  return (
    <>
      <primitive ref={modelRef} object={fbx} />
    </>
  );
};

const App = () => {
  return (
    <div className='w-screen h-screen'>
      <Leva />
      <Canvas
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
      >
        <OrthographicCamera
          makeDefault
          position={[0, 50, 0]}
          zoom={10}
          near={1}
          far={1000}
        />
        {/* Lighting */}
        <ambientLight intensity={0.5} />
        <directionalLight
          position={[10, 10, 5]}
          intensity={1}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
        <hemisphereLight
          intensity={0.1}
          groundColor="#ff0000"
          color="#0000ff"
        />

        {/* Suspense to handle async loading */}
        <Suspense fallback={null}>
          <Model url="/models/koi_showa.fbx" />
        </Suspense>

        {/* Orbit Controls for camera manipulation */}
        <OrbitControls
          enableRotate={false}
          enablePan={true}
          minZoom={1}
          maxZoom={20}
          target={[0, 0, 0]}
        />
      </Canvas>
      <Loader />
    </div>
  );
};


export default App;