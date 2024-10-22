import { Canvas } from '@react-three/fiber';
import { OrbitControls, useFBX, Loader, Line } from '@react-three/drei';
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

const Model = ({ url }) => {
  // Refs for animation and model
  const modelRef = useRef();
  const mixer = useRef();
  const actions = useRef({});
  const currentAction = useRef();
  const clock = useRef(new THREE.Clock());
  const previousUp = useRef(new Vector3(0, 1, 0));

  // Define the path using CatmullRomCurve3
  const path = useRef(
    new THREE.CatmullRomCurve3(
      [
        new Vector3(0, 0, 0),
        new Vector3(10, 0, 20),
        new Vector3(20, 0, -20),
        new Vector3(30, 0, 0),
        new Vector3(40, 0, 20),
        new Vector3(50, 0, -10),
        new Vector3(60, 0, 10),
      ],
      false, // closed curve
      'catmullrom',
      0.5 // tension for smoother turns
    )
  );

  // Load textures
  const diffuseMap = useLoader(TextureLoader, '/models/textures/koi_showa_diff.png');
  const bumpMap = useLoader(TextureLoader, '/models/textures/koi_showa_bump.png');
  const specularMap = useLoader(TextureLoader, '/models/textures/koi_showa_spec.png');
  const subsurfaceMap = useLoader(TextureLoader, '/models/textures/koi_showa_subsur.png');

  // Apply textures when model loads
  useEffect(() => {
    if (!modelRef.current) return;
  
    // Traverse the model to find meshes
    modelRef.current.traverse((child) => {
      if (child.isMesh) {
        // Create a new standard material with textures
        child.material = new THREE.MeshStandardMaterial({
          // map: diffuseMap,              // Color/diffuse texture
          // bumpMap: bumpMap,             // Bump mapping
          bumpScale: 1,              // Adjust bump strength
          // roughnessMap: specularMap,    // Using spec map for roughness
          roughness: 5,               // Base roughness
          metalness: 2,               // Base metalness
          envMapIntensity: 1,           // Environment map intensity
        });
        
        // Enable shadow casting and receiving
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }, [diffuseMap, bumpMap, specularMap, subsurfaceMap]);

  // State
  const [fishState, setFishState] = useState(FISH_STATES.SWIMMING);
  const [velocity, setVelocity] = useState(0.05); // velocity as t increment per frame
  const progress = useRef(0);

  // Load the FBX model and set up animations
  const fbx = useFBX(url);
  const animations = fbx.animations;

  // Animation controls
  const { animation: selectedAnimation } = useControls({
    animation: {
      options: animations.map((clip) => clip.name),
      value: animations[0]?.name || '',
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

    nextAction.reset().play();
    currentAction.current.crossFadeTo(nextAction, 1, false);
    currentAction.current = nextAction;
  }, [selectedAnimation]);

  // Update movement and rotation each frame
  useFrame((state, delta) => {
    mixer.current?.update(delta);

    if (!modelRef.current || fishState !== FISH_STATES.SWIMMING) return;

    // Update progress along path
    progress.current = (progress.current + velocity * delta) % 1;

    // Get current position and direction
    const point = path.current.getPointAt(progress.current);
    const tangent = path.current.getTangentAt(progress.current);
    const targetPoint = point.clone().add(tangent);

    // Update position
    modelRef.current.position.copy(point);

    // Calculate and apply rotation
    const lookAt = new THREE.Matrix4();
    const up = previousUp.current.clone();
    
    if (up.dot(new Vector3(0, 1, 0)) < 0) up.negate();
    
    lookAt.lookAt(point, targetPoint, up);
    
    const targetQuaternion = new THREE.Quaternion()
      .setFromRotationMatrix(lookAt)
      .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0)));

    modelRef.current.quaternion.slerp(targetQuaternion, 0.1);
    previousUp.current.copy(up);
  });

  return (
    <>
      <primitive ref={modelRef} object={fbx} />
      <Line
        points={path.current.getPoints(100)}
        color="blue"
        lineWidth={2}
        dashed={false}
      />
    </>
  );
};

const App = () => {
  return (
    <div className='w-screen h-screen'>
      <Leva />
      <Canvas
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
        camera={{ position: [0, 5, 30], fov: 60 }}
      >
        {/* Lighting */}
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} />

        {/* Suspense to handle async loading */}
        <Suspense fallback={null}>
          <Model url="/models/koi_showa.fbx" />
        </Suspense>

        {/* Orbit Controls for camera manipulation */}
        <OrbitControls />
      </Canvas>
      <Loader />
    </div>
  );
};


export default App;