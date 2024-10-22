import { Canvas } from '@react-three/fiber';
import { OrbitControls, useFBX, Loader } from '@react-three/drei';
import { useRef, useEffect, Suspense } from 'react';
import { useControls } from 'leva';
import { AnimationMixer } from 'three';
import { Leva } from 'leva';
import { useFrame } from '@react-three/fiber';



const Model = ({ url }) => {
  const fbx = useFBX(url);
  const mixer = useRef(null);
  const actions = useRef({});
  const currentAction = useRef(null);

  // Extract animation clips from the FBX model
  const animations = fbx.animations || [];

  // Extract animation names
  const animationNames = animations.map((clip) => clip.name);

  // Leva GUI controls
  const { animation: selectedAnimation } = useControls('Animations', {
    animation: {
      options: animationNames,
      value: animationNames[0] || '',
    },
  });

  // Initialize AnimationMixer and Actions
  useEffect(() => {
    if (animations.length) {
      mixer.current = new AnimationMixer(fbx);

      // Create animation actions
      animations.forEach((clip) => {
        actions.current[clip.name] = mixer.current.clipAction(clip);
      });

      // Play the initial animation
      if (selectedAnimation && actions.current[selectedAnimation]) {
        actions.current[selectedAnimation].play();
        currentAction.current = actions.current[selectedAnimation];
      }
    } else {
      console.warn('No animations found in the FBX model.');
    }

    // Clean up on unmount
    return () => {
      if (mixer.current) {
        mixer.current.stopAllAction();
        mixer.current.uncacheRoot(fbx);
      }
    };
  }, [fbx, animations, selectedAnimation]);

  // Handle animation switching
  useEffect(() => {
    if (!mixer.current || !selectedAnimation) return;

    if (currentAction.current) {
      currentAction.current.fadeOut(0.5);
    }

    const nextAction = actions.current[selectedAnimation];
    if (nextAction) {
      nextAction.reset().fadeIn(0.5).play();
      currentAction.current = nextAction;
    } else {
      console.warn(`Animation "${selectedAnimation}" not found.`);
    }
  }, [selectedAnimation]);

  // Update mixer on each frame
  useFrame((state, delta) => {
    if (mixer.current) {
      mixer.current.update(delta);
    }
  });

  return <primitive object={fbx} />;
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
          {/* Load FBX model */}
          <Model url="/models/koi_showa.fbx" />
        </Suspense>

        {/* Orbit Controls for camera manipulation */}
        <OrbitControls />
      </Canvas>

    
    </div>
  );
};

export default App;