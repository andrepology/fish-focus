import { Canvas } from '@react-three/fiber';
import { OrbitControls, useFBX, Loader } from '@react-three/drei';
import { useRef, useEffect, Suspense } from 'react';
import { useControls } from 'leva';
import { AnimationMixer, LoopRepeat } from 'three';
import { Leva } from 'leva';
import { useFrame } from '@react-three/fiber';



const Model = ({ url }) => {
  const modelRef = useRef();
  const mixer = useRef();
  const actions = useRef({});
  const currentAction = useRef();

  // Load the FBX model
  const fbx = useFBX(url);
  const animations = fbx.animations;

  // Set up GUI controls for animations
  const { animation: selectedAnimation } = useControls({
    animation: {
      options: animations.map((clip) => clip.name),
      value: animations[0]?.name || '',
    },
  });

  // Initialize the mixer and actions when the model is loaded
  useEffect(() => {
    if (!modelRef.current) return;

    mixer.current = new AnimationMixer(modelRef.current);

    // Create actions for each animation clip
    animations.forEach((clip) => {
      const action = mixer.current.clipAction(clip);
      actions.current[clip.name] = action;
      action.setLoop(LoopRepeat, Infinity);
    });

    // Play the initial animation
    const initialAction = actions.current[selectedAnimation];
    initialAction.play();
    currentAction.current = initialAction;

    return () => {
      mixer.current.stopAllAction();
    };
  }, [animations]);

  // Handle animation switching with crossfading
  useEffect(() => {
    if (!mixer.current || !selectedAnimation) return;

    const nextAction = actions.current[selectedAnimation];
    if (!nextAction) {
      console.warn(`Animation "${selectedAnimation}" not found.`);
      return;
    }

    if (currentAction.current === nextAction) return;

    // Crossfade from the current action to the next action
    nextAction.reset();
    nextAction.play();
    currentAction.current.crossFadeTo(nextAction, 0.5, false);

    currentAction.current = nextAction;
  }, [selectedAnimation]);

  // Update the mixer on each frame
  useFrame((_, delta) => {
    mixer.current?.update(delta);
  });

  return <primitive ref={modelRef} object={fbx} />;
};



const App = () => {
  return (
    <div className='w-screen h-screen'>
      

      <Canvas style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} camera={{ position: [0, 100, 10], fov: 60 }}>
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

    
    </div>
  );
};

export default App;