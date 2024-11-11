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
    
    // Configure vehicle properties for smoother motion
    this.maxSpeed = 5;
    this.maxForce = 10;
    this.maxTurnRate = Math.PI;
    
    
    
    // Configure wander behavior with more pronounced settings
    this.wanderBehavior = new YUKA.WanderBehavior();
    this.wanderBehavior.jitter = 50;      // More random movement
    this.wanderBehavior.radius = 5;      // Larger wander circle
    this.wanderBehavior.distance = 100;   // Project circle further ahead
    this.wanderBehavior.weight = 0.1;      // Full weight for wander force
    
    // Add the behavior to the steering manager
    this.steering.add(this.wanderBehavior);
  }
}

const Model = ({ url }) => {

  const controls = useControls({
    // Swimming parameters
    amplitude: { value: 0.2, min: 0.1, max: 1, step: 0.1 },
    waveFraction: { value: 2, min: 0.5, max: 2, step: 0.1 },
    waveSpeed: { value: 0.5, min: 0.1, max: 5, step: 0.1 },
    headMovementScale: { value: 0.2, min: 0, max: 1, step: 0.05 },
    bodyMovementScale: { value: 0.5, min: 0, max: 1, step: 0.05 },
  });

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
      
      const offset = new THREE.Vector3(0, 0, 0);
      // const offset = new THREE.Vector3(0, 0, 5.58); // Move pivot point forward
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
  const theta = useRef(0);

  // Initialize spine chain and store rest pose
  useEffect(() => {
    if (!modelRef.current) return;

    const spineOrder = [
      'Head2',
      'Head1',
      'Neck2',
      'Neck1',
      'Center',
      'Spine1',
      'Spine2',
      'Spine3',
      'Tail1',
      'Tail2',
      'Tail3',
      'Tail4',
      'Tail5',
      'Tail6',
      'Tail7'
    ];
    const bones = [];

    modelRef.current.traverse((child) => {
      if (child.isBone) {
        const index = spineOrder.indexOf(child.name);
        if (index !== -1) {
          bones[index] = child;
          restPose.current.set(child.name, {
            x: child.rotation.x,
            y: child.rotation.y,
            z: child.rotation.z
          });
        }
      }
    });

    spineChain.current = bones.filter(Boolean);
  }, []);

  // Update YUKA and fish motion
  useFrame((state, delta) => {
    if (!modelRef.current || !fishAI.current || spineChain.current.length === 0) return;

    // Update YUKA
    const deltaTime = yukaTime.current.update().getDelta();
    entityManager.current.update(deltaTime);

    // Get the fish's current speed
    const speed = fishAI.current.getSpeed();
    const maxSpeed = fishAI.current.maxSpeed;
    const speedRatio = speed / maxSpeed;

    // Link swimming parameters to fish speed
    const amplitude = controls.amplitude * speedRatio;
    const waveSpeed = controls.waveSpeed * speedRatio;
    const waveFraction = controls.waveFraction;

    // Update phase angle theta
    theta.current += delta * waveSpeed;

    // Apply attenuated sine wave to each bone
    spineChain.current.forEach((bone, index) => {
      if (!bone) return;

      const restRotation = restPose.current.get(bone.name);
      const totalBones = spineChain.current.length;
      const x = index / (totalBones - 1); // x ranges from 0 (head) to 1 (tail)

      // Attenuation factor to reduce motion near the head
      const attenuation = controls.headMovementScale + (1 - controls.headMovementScale) * x ** 2;

      // Calculate rotation angle using attenuated sine function
      const angle = amplitude * attenuation * Math.sin(2 * Math.PI * waveFraction * x + theta.current);

      // Apply rotation around Z-axis for side-to-side motion
      bone.rotation.z = restRotation.z + angle * controls.bodyMovementScale;
    });
  });

  // Visual debugger for YUKA
  function WanderDebug({ fish }) {
    const wanderCircleRef = useRef();
    const wanderTargetRef = useRef();
    const fishPositionRef = useRef();
  
    useFrame(() => {
      if (
        !fish.current ||
        !wanderCircleRef.current ||
        !wanderTargetRef.current ||
        !fishPositionRef.current
      ) return;
  
      // Get the wander behavior from the fish's steering behaviors
      const wanderBehavior = fish.current.steering.behaviors.find(
        behavior => behavior instanceof YUKA.WanderBehavior
      );
  
      if (wanderBehavior) {
        const vehicle = fish.current;
        const wanderRadius = wanderBehavior.radius;
        const wanderDistance = wanderBehavior.distance;
        const wanderJitter = wanderBehavior.jitter;
  
        // Calculate the wander circle center
        const circleCenter = new YUKA.Vector3().copy(vehicle.velocity);
        circleCenter.normalize().multiplyScalar(wanderDistance);
        circleCenter.add(vehicle.position);
  
        // For debugging purposes, we can visualize the wander circle and the random vector
        const theta = Math.atan2(vehicle.velocity.x, vehicle.velocity.z);
  
        // Generate a random point on the circle
        const randomDisplacement = new YUKA.Vector3(
          (Math.random() - 0.5) * wanderJitter,
          0,
          (Math.random() - 0.5) * wanderJitter
        );
  
        // Combine the circle center with the displacement to get the wander target
        const wanderTarget = new YUKA.Vector3().copy(circleCenter).add(randomDisplacement);
  
        // Update debug visual positions
        wanderCircleRef.current.position.set(circleCenter.x, circleCenter.y, circleCenter.z);
        wanderCircleRef.current.scale.set(wanderRadius, wanderRadius, wanderRadius);
  
        wanderTargetRef.current.position.set(wanderTarget.x, wanderTarget.y, wanderTarget.z);
        fishPositionRef.current.position.set(vehicle.position.x, vehicle.position.y, vehicle.position.z);
      }
    });
  
    return (
      <>
        {/* Debug sphere for wander circle */}
        <mesh ref={wanderCircleRef}>
          <sphereGeometry args={[1, 16, 16]} />
          <meshBasicMaterial color="yellow" wireframe />
        </mesh>
  
        {/* Debug sphere for wander target */}
        <mesh ref={wanderTargetRef}>
          <sphereGeometry args={[0.5, 16, 16]} />
          <meshBasicMaterial color="red" wireframe />
        </mesh>
  
        {/* Debug sphere for fish AI position */}
        <mesh ref={fishPositionRef}>
          <sphereGeometry args={[0.5, 16, 16]} />
          <meshBasicMaterial color="blue" wireframe />
        </mesh>
      </>
    );
  }

  return (
    <>
      <primitive ref={modelRef} object={fbx} />

      {/* Include the visual debugger */}
      <WanderDebug fish={fishAI} />
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