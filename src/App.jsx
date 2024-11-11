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
    this.maxSpeed = 2;
    this.maxForce = 0.5;
    this.maxTurnRate = Math.PI * 0.8; // Limit turn rate for more natural movement
    
    // Add velocity smoothing
    this.smoother = new YUKA.Smoother(8); // Smooth over 8 frames
    
    // Create boundary walls as proper GameEntity instances
    const boundarySize = 100;
    const obstacles = [];
    
    // Create each wall as a separate GameEntity
    const topWall = new YUKA.GameEntity();
    topWall.position = new YUKA.Vector3(0, 0, -boundarySize);
    topWall.boundingRadius = 5;
    obstacles.push(topWall);
    
    const bottomWall = new YUKA.GameEntity();
    bottomWall.position = new YUKA.Vector3(0, 0, boundarySize);
    bottomWall.boundingRadius = 5;
    obstacles.push(bottomWall);
    
    const leftWall = new YUKA.GameEntity();
    leftWall.position = new YUKA.Vector3(-boundarySize, 0, 0);
    leftWall.boundingRadius = 5;
    obstacles.push(leftWall);
    
    const rightWall = new YUKA.GameEntity();
    rightWall.position = new YUKA.Vector3(boundarySize, 0, 0);
    rightWall.boundingRadius = 5;
    obstacles.push(rightWall);

    // Configure obstacle avoidance behavior
    this.obstacleBehavior = new YUKA.ObstacleAvoidanceBehavior(obstacles);
    this.obstacleBehavior.dBoxMinLength = 12; // Longer detection box for earlier reaction
    this.obstacleBehavior.brakingWeight = 200;
    this.obstacleBehavior.weight = 5;
    
    // Configure wander behavior
    this.wanderBehavior = new YUKA.WanderBehavior();
    this.wanderBehavior.jitter = 1;
    this.wanderBehavior.radius = 5;
    this.wanderBehavior.distance = 100;
    this.wanderBehavior.weight = 100;
    
    // Add both behaviors
    this.steering.add(this.obstacleBehavior);
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
          // console.log(`Found bone: ${child.name}`);
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

    const speed = fishAI.current.velocity.length();
    const time = state.clock.getElapsedTime();
    
    // Get YUKA steering data
    const velocity = fishAI.current.velocity;
    const maxSpeed = fishAI.current.maxSpeed;
    const speedRatio = speed / maxSpeed; // For amplitude modulation
    
    // Calculate turn rate (not just instant force)
    const prevDirection = fishAI.current.forward.clone();
    const currentDirection = velocity.clone().normalize();
    const turnRate = prevDirection.angleTo(currentDirection) / delta;
    let prevSpeed = fishAI.current.velocity.length()

    spineChain.current.forEach((bone, index) => {
      if (!bone) return;
      
      const restRotation = restPose.current.get(bone.name);
      const tailFactor = index / (spineChain.current.length - 1);
      
      // 1. Base undulation - traveling wave
      const frequency = 2 * (speedRatio + 0.5); // Faster swimming = faster undulation
      const baseAmplitude = 0.15 * Math.min(1, speedRatio + 0.3); // Limited by speed
      const phaseOffset = index * Math.PI * 0.15; // Increased wave spacing
      const swimMotion = Math.sin(time * frequency + phaseOffset) * baseAmplitude;
      
      // 2. Turn compensation - gradual C-shape
      const turnInfluence = Math.sign(turnRate) * 
                           Math.min(Math.abs(turnRate), Math.PI * 0.5) * // Limit max turn
                           Math.pow(tailFactor, 1.5) * // Non-linear increase towards tail
                           0.2; // Overall turn strength
      
      // 3. Acceleration influence
      const accelerationFactor = (speed - prevSpeed) / delta;
      const accelerationInfluence = -accelerationFactor * 
                                   Math.pow(tailFactor, 2) * // Mostly affects tail
                                   0.05; // Strength factor
      
      // Combine all influences with proper weighting
      bone.rotation.z = restRotation.z + 
                       swimMotion + 
                       turnInfluence * (1 - Math.abs(swimMotion)) + // Reduce during extreme undulation
                       accelerationInfluence;
    });
    
    // Store speed for next frame's acceleration calculation
    prevSpeed = speed;
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