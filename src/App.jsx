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
  // Refs for animation and model
  const modelRef = useRef();
  const mixer = useRef();
  const actions = useRef({});
  const currentAction = useRef();
  const previousUp = useRef(new Vector3(0, 1, 0));

  // State
  const [fishState, setFishState] = useState(FISH_STATES.SWIMMING);
  const velocity = useRef(0.1); // Base speed
  const acceleration = useRef(0.001);
  const maxSpeed = 0.2;
  const minSpeed = 0.05;
  const targetPosition = useRef(getRandomTarget(50)); // Initial target
  const maxTurnAngle = Math.PI / 180 * 2; // Maximum turn angle per frame in radians

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
        // Create a new standard material with textures
        child.material = new THREE.MeshStandardMaterial({
          map: diffuseMap,              // Color/diffuse texture
          bumpMap: bumpMap,             // Bump mapping
          bumpScale: 0.05,              // Adjust bump strength
          roughnessMap: specularMap,    // Using spec map for roughness
          roughness: 0.5,               // Base roughness
          metalness: 0.2,               // Base metalness
          envMapIntensity: 1,           // Environment map intensity
        });

        // Enable shadow casting and receiving
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }, [diffuseMap, bumpMap, specularMap]);

  // Load the FBX model and set up animations
  const fbx = useFBX(url);
  const animations = fbx.animations;

  // Animation controls
  const { animation: selectedAnimation } = useControls({
    animation: {
      options: animations.map((clip) => clip.name),
      value: animations[1]?.name || '',
    },
  });

  // Initialize animations
  useEffect(() => {
    if (!modelRef.current) return;

    mixer.current = new AnimationMixer(modelRef.current);
    animations.forEach((clip) => {
      const action = mixer.current.clipAction(clip);
      actions.current[clip.name] = action;
      action.setLoop(LoopRepeat, Infinity);
    });


    const initialAction = actions.current[selectedAnimation];
    initialAction.play();
    currentAction.current = initialAction;

    return () => mixer.current.stopAllAction();
  }, [animations, selectedAnimation]);

  // Handle animation switching
  useEffect(() => {
    if (!mixer.current || !selectedAnimation) return;
    const nextAction = actions.current[selectedAnimation];
    if (!nextAction || currentAction.current === nextAction) return;

    // Start new action before stopping the previous one
    nextAction.reset();
    nextAction.setEffectiveTimeScale(1);
    nextAction.setEffectiveWeight(1);
    nextAction.play();

    // Crossfade with previous action
    if (currentAction.current) {
      const duration = 0.5; // Duration of crossfade in seconds
      currentAction.current.crossFadeTo(nextAction, duration, true);
    }

    currentAction.current = nextAction;
  }, [selectedAnimation]);

  // Position and direction refs
  const position = useRef(new THREE.Vector3()); // Fish's current position
  const direction = useRef(new THREE.Vector3(1, 0, 0)); // Fish's current direction

  // Add Yuka entities
  const fishAI = useRef();
  const entityManager = useRef(new YUKA.EntityManager());
  const time = useRef(new YUKA.Time());

  // Initialize AI and model
  useEffect(() => {
    if (!modelRef.current) return;

    // Create fish AI
    fishAI.current = new Fish();
    fishAI.current.position.copy(position.current);
    
    // Create sync function to update Three.js object from AI
    const sync = (entity, renderComponent) => {
      // Update position
      renderComponent.position.copy(entity.position);
      
      // Calculate rotation based on velocity direction
      if (entity.velocity.length() > 0.001) {  // Only rotate if moving
        const direction = entity.velocity.clone().normalize();
        const angle = Math.atan2(direction.x, direction.z);
        const euler = new THREE.Euler(0, angle, 0);
        renderComponent.quaternion.setFromEuler(euler);
      }
    };

    // Connect AI to visual model
    fishAI.current.setRenderComponent(modelRef.current, sync);
    entityManager.current.add(fishAI.current);
    
    return () => {
      entityManager.current.clear();
    };
  }, []);

  // Replace existing movement code in useFrame with:
  useFrame((state, delta) => {
    // Update animation mixer
    mixer.current?.update(delta);
  
    if (!modelRef.current || fishState !== FISH_STATES.SWIMMING || !fishAI.current) return;
  
    // Update AI
    const deltaTime = time.current.update().getDelta();
    entityManager.current.update(deltaTime);
  
    // Get current velocity and calculate animation parameters
    const currentVelocity = fishAI.current.velocity.length();
    const velocityFactor = THREE.MathUtils.clamp(currentVelocity / fishAI.current.maxSpeed, 0.3, 1);
    
    // Get turning amount from velocity direction change
    const currentDirection = fishAI.current.velocity.clone().normalize();
    const turnAmount = Math.atan2(currentDirection.x, currentDirection.z);
    
    // Update procedural animation
    const swimTime = state.clock.getElapsedTime();
    modelRef.current.traverse((child) => {
      if (child.isBone) {
        if (child.name.startsWith('Spine') || 
            child.name.startsWith('Tail') || 
            child.name.startsWith('TailA') || 
            child.name.startsWith('TailB')) {
          
          // Calculate bone index (higher number = further back in the spine)
          const boneIndex = parseInt(child.name.match(/\d+/) || '0');
          
          // Increase amplitude towards the tail
          const tailFactor = boneIndex / 10 + 0.5; // Adjust these numbers to taste
          
          // Base swim motion
          const frequency = 5 * velocityFactor; // Swim faster when moving faster
          const baseAmplitude = 0.15 * velocityFactor; // Stronger swing with higher speed
          
          // Add turn influence
          const turnInfluence = turnAmount * 0.5 * tailFactor; // Adjust multiplier to taste
          
          // Combine swimming and turning
          const phase = child.name.includes('Tail') ? Math.PI / 2 : 0;
          const sway = (Math.sin(swimTime * frequency + phase) * baseAmplitude * tailFactor) + turnInfluence;
          
          // Apply smoother rotation
          child.rotation.y = THREE.MathUtils.lerp(
            child.rotation.y,
            sway,
            delta * 10 // Adjust smoothing factor
          );
        }
      }
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