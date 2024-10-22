import { Canvas } from '@react-three/fiber';
import { OrbitControls, useFBX, Loader, Line, OrthographicCamera } from '@react-three/drei';
import { useRef, useEffect, Suspense } from 'react';
import { useControls } from 'leva';
import { AnimationMixer, LoopRepeat, Vector3, TextureLoader } from 'three';
import { Leva } from 'leva';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { useState } from 'react';

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

    console.log(animations);

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

  // Update movement and rotation each frame
  useFrame((state, delta) => {
    mixer.current?.update(delta);

    if (!modelRef.current || fishState !== FISH_STATES.SWIMMING) return;

    const currentPosition = position.current;
    const currentDirection = direction.current;
    const targetPos = targetPosition.current;

    // Calculate the desired direction
    const desiredDirection = targetPos.clone().sub(currentPosition).normalize();

    // Calculate the angle between current and desired directions
    let angle = currentDirection.angleTo(desiredDirection);

    // Cross product to determine turn direction
    const cross = new THREE.Vector3().crossVectors(currentDirection, desiredDirection);
    const turnDirection = cross.y >= 0 ? 1 : -1;

    // Limit the turn angle
    const maxTurn = maxTurnAngle * delta * 60; // Adjust for frame rate
    if (angle > maxTurn) angle = maxTurn;

    // Update current direction
    const axis = new THREE.Vector3(0, 1, 0); // Y-axis for horizontal turning
    const quaternion = new THREE.Quaternion().setFromAxisAngle(axis, angle * turnDirection);
    currentDirection.applyQuaternion(quaternion).normalize();

    // Update speed based on some natural variation
    velocity.current += (Math.random() - 0.5) * acceleration.current;
    velocity.current = THREE.MathUtils.clamp(velocity.current, minSpeed, maxSpeed);

    // Update position
    const moveDistance = velocity.current * delta * 60; // Adjust for frame rate
    currentPosition.add(currentDirection.clone().multiplyScalar(moveDistance));
    modelRef.current.position.copy(currentPosition);

    // Update rotation
    const rotationMatrix = new THREE.Matrix4().lookAt(
      currentPosition.clone().add(currentDirection),
      currentPosition,
      new THREE.Vector3(0, 1, 0)
    );
    const targetQuaternion = new THREE.Quaternion().setFromRotationMatrix(rotationMatrix);
    modelRef.current.quaternion.slerp(targetQuaternion, 0.1);

    // If close to the target, pick a new target
    if (currentPosition.distanceTo(targetPos) < 5) {
      targetPosition.current = getRandomTarget(50);
    }

    // Update camera with smoother following
    // const cameraTarget = currentPosition.clone();
    // state.camera.position.lerp(new Vector3(cameraTarget.x, 50, cameraTarget.z), 0.05);
    // state.camera.lookAt(cameraTarget.x, cameraTarget.y, cameraTarget.z);
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