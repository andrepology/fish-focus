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
import { useThree } from '@react-three/fiber';





class Fish extends YUKA.Vehicle {
  constructor() {
    super();

    // Configure vehicle properties
    this.maxSpeed = 2;
    this.maxForce = 5;

    // Important: Set the vehicle's forward vector to match the fish's natural orientation
    // Assuming the fish model's natural forward direction is along positive Z
    this.forward = new YUKA.Vector3(0, 0, 1);


    // Configure wander behavior
    this.wanderBehavior = new YUKA.WanderBehavior();
    this.wanderBehavior.jitter = 0.1;
    this.wanderBehavior.radius = 2;
    this.wanderBehavior.distance = 100;
    this.wanderBehavior.weight = 0.5;

    this.steering.add(this.wanderBehavior);
  }
}


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
  const yukaTime = useRef(new YUKA.Time());




  // Initialize AI and model
  useEffect(() => {
    if (!modelRef.current) return;

    fishAI.current = new Fish();
    fishAI.current.position.copy(position.current);

    // Define sync function to properly orient the model
    const sync = (entity, renderComponent) => {
      // Calculate offset from tail to center (based on the model's center point)
      const offset = new THREE.Vector3(0, 0, 5.58); // Move pivot point forward
      offset.applyQuaternion(renderComponent.quaternion);
      
      // Apply position with offset
      renderComponent.position.copy(entity.position).add(offset);
      
      // Only update rotation if we're actually moving
      if (entity.velocity.length() > 0.001) {
        const direction = entity.velocity.clone().normalize();
        const angle = Math.atan2(direction.x, direction.z);
        renderComponent.rotation.y = angle;
      }
    };
    fishAI.current.setRenderComponent(modelRef.current, sync);
    entityManager.current.add(fishAI.current);

    return () => {
      entityManager.current.clear();
    };
  }, []);

  // Add new refs for motion control
  const spineChain = useRef([]);
  const restPose = useRef(new Map());

  const time = useRef(0);

  // Initialize spine chain and store rest pose
  useEffect(() => {
    if (!modelRef.current) return;

    const spineOrder = ['Center', 'Spine1', 'Spine2', 'Spine3', 'Tail1', 'Tail2', 'Tail3', 'Tail4', 'Tail5', 'Tail6', 'Tail7'];
    const bones = [];

    modelRef.current.traverse((child) => {
      if (child.isBone) {
        const index = spineOrder.indexOf(child.name);
        if (index !== -1) {
          bones[index] = child;
          // Store initial rotation as rest pose
          restPose.current.set(child.name, {
            x: child.rotation.x,
            y: child.rotation.y,
            z: child.rotation.z
          });
          console.log(`Found bone: ${child.name}`);
        }
      }
    });

    spineChain.current = bones.filter(Boolean);
  }, []);

  const cameraRef = useRef();
  const { camera } = useThree();


  // Update YUKA and fish motion
  useFrame((state, delta) => {
    if (!modelRef.current || !fishAI.current || spineChain.current.length === 0) return;

    // Update YUKA
    const deltaTime = yukaTime.current.update().getDelta();
    entityManager.current.update(deltaTime);

    const speed = fishAI.current.velocity.length();
    const time = state.clock.getElapsedTime();

    spineChain.current.forEach((bone, index) => {
      if (!bone) return;

      // Get rest pose rotation
      const restRotation = restPose.current.get(bone.name);

      // Calculate wave parameters
      const tailFactor = index / (spineChain.current.length - 1);
      const frequency = 0.3 * (speed + 1);
      const amplitude = 0.3 * tailFactor;
      
      // Calculate rotation with phase offset
      const phaseOffset = index * Math.PI * 0.1;
      const rotationZ = Math.sin(time * frequency + phaseOffset) * amplitude;

      // Apply rotation around Z-axis for side-to-side motion, adding to rest pose
      bone.rotation.z = restRotation.z + rotationZ;
    });
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