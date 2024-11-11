import { Canvas } from '@react-three/fiber';
import { OrbitControls, useFBX, Loader, Line, OrthographicCamera } from '@react-three/drei';
import { useRef, useEffect, Suspense, useCallback } from 'react';
import { useControls } from 'leva';
import { AnimationMixer, LoopRepeat, Vector3, TextureLoader } from 'three';
import { Leva } from 'leva';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { useState } from 'react';
import * as YUKA from 'yuka';
import { useThree } from '@react-three/fiber';



class WanderState extends YUKA.State {
  enter(fish) {
    fish.wanderBehavior.active = true;
    fish.arriveBehavior.active = false;
    fish.foodTarget = null;
  }

  execute(fish) {
    // Continue wandering
  }

  exit(fish) {
    fish.wanderBehavior.active = false;
  }
}

// SeekFood State
class SeekFoodState extends YUKA.State {
  enter(fish) {
    fish.wanderBehavior.active = false;
    fish.arriveBehavior.active = true;
  }

  execute(fish) {
    // Check if we've lost our food target
    if (!fish.foodTarget) {
      fish.stateMachine.changeTo('Wander');
      return;
    }

    // Check distance to food
    const distanceToFood = fish.position.distanceTo(fish.foodTarget.position);

    if (distanceToFood < 1) {
      // Food consumption is handled in the useFrame loop
      fish.arriveBehavior.active = false;
    }
  }

  exit(fish) {
    fish.arriveBehavior.active = false;
  }
}
// Rest State
class RestState extends YUKA.State {
  enter(fish) {
    fish.wanderBehavior.active = false;
    fish.arriveBehavior.active = false;
    fish.velocity.set(0, 0, 0);
    fish.restTimer = 0;
  }

  execute(fish) {
    fish.restTimer += fish.manager.deltaTime;

    // Rest for 3 seconds before returning to wander
    if (fish.restTimer > 3) {
      fish.stateMachine.changeTo('Wander');
      fish.wanderBehavior.active = true;
    }
  }

  exit(fish) {
    fish.restTimer = 0;
  }
}




class Fish extends YUKA.Vehicle {
  constructor() {
    super();

    // Configure vehicle properties
    this.maxSpeed = 5;
    this.maxForce = 10;
    this.maxTurnRate = Math.PI / 4;

    // Initialize behaviors
    this.wanderBehavior = new YUKA.WanderBehavior();
    this.wanderBehavior.jitter = 50;
    this.wanderBehavior.radius = 5;
    this.wanderBehavior.distance = 100;
    this.wanderBehavior.weight = 0.1;

    this.arriveBehavior = new YUKA.ArriveBehavior();
    this.arriveBehavior.deceleration = 3;
    this.arriveBehavior.active = false;
    this.arriveBehavior.weight = 1.0;

    this.steering.add(this.wanderBehavior);
    this.steering.add(this.arriveBehavior);

    // Initialize state machine
    this.stateMachine = new YUKA.StateMachine(this);
    this.stateMachine.add('Wander', new WanderState());
    this.stateMachine.add('SeekFood', new SeekFoodState());
    this.stateMachine.add('Rest', new RestState());
    this.stateMachine.changeTo('Rest');

    // Additional properties
    this.foodTarget = null; // Reference to the current food target
  }

  update(delta) {
    // Update the state machine
    this.stateMachine.update();
    // Update steering behaviors
    super.update(delta);
  }
}

const Model = ({ url }) => {



  const controls = useControls({
    // Swimming parameters
    amplitude: { value: 0.3, min: 0.1, max: 1, step: 0.1 },
    waveFraction: { value: 1.6, min: 0.5, max: 2, step: 0.1 },
    waveSpeed: { value: 2.5, min: 0.1, max: 5, step: 0.1 },
    headMovementScale: { value: 0.2, min: 0, max: 1, step: 0.05 },
    bodyMovementScale: { value: 0.5, min: 0, max: 1, step: 0.05 },

    // Rest parameters
    restingTailAmplitude: { value: 0.1, min: 0, max: 0.3, step: 0.01 },
    restingTailSpeed: { value: 1.0, min: 0.1, max: 2.0, step: 0.1 },
    gillMovementSpeed: { value: 2.0, min: 0.5, max: 4.0, step: 0.1 },
    gillMovementAmount: { value: 0.15, min: 0, max: 0.3, step: 0.01 },

    // Pectoral (Side) Fin Controls
    pecFinIdleSpeed: { value: 1.0, min: 0.1, max: 3.0, step: 0.1 },
    pecFinIdleAmount: { value: 0.15, min: 0, max: 0.5, step: 0.01 },
    pecFinSwimAmount: { value: 0.3, min: 0, max: 1.0, step: 0.01 },

    // Dorsal (Top) Fin Controls
    dorsFinWaveSpeed: { value: 1.2, min: 0.1, max: 3.0, step: 0.1 },
    dorsFinWaveAmount: { value: 0.1, min: 0, max: 0.3, step: 0.01 },

    // Pelvic (Bottom) Fin Controls
    pelvFinSpeed: { value: 0.8, min: 0.1, max: 2.0, step: 0.1 },
    pelvFinAmount: { value: 0.12, min: 0, max: 0.3, step: 0.01 },

    // Anal Fin Controls
    analFinSpeed: { value: 1.0, min: 0.1, max: 2.0, step: 0.1 },
    analFinAmount: { value: 0.08, min: 0, max: 0.3, step: 0.01 },
  });

  // Keep only essential refs
  const modelRef = useRef();
  const [foods, setFoods] = useState([]);


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
  const secondaryTheta = useRef(0);




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



  const { scene, camera, gl } = useThree();


  const handleMouseClick = (event) => {
    if (!fishAI.current) return;

    // Get mouse position
    const rect = gl.domElement.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Create a raycaster
    const mouse = new THREE.Vector2(x, y);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);

    // Define a plane (XZ plane at y = 0)
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    // Calculate the intersection point
    const intersectionPoint = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, intersectionPoint);

    // Create a visual representation of the food
    const foodGeometry = new THREE.BoxGeometry(3, 3, 3);
    const foodMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const foodMesh = new THREE.Mesh(foodGeometry, foodMaterial);
    foodMesh.position.copy(intersectionPoint);
    scene.add(foodMesh);

    // Add to foods state
    setFoods(prevFoods => [...prevFoods, foodMesh]);

    // Set the target and change state
    fishAI.current.arriveBehavior.target.copy(intersectionPoint);
    fishAI.current.foodTarget = foodMesh;
    fishAI.current.stateMachine.changeTo('SeekFood');
  };

  // Add event listener
  useEffect(() => {
    gl.domElement.addEventListener('click', handleMouseClick);

    return () => {
      gl.domElement.removeEventListener('click', handleMouseClick);
    };
  }, [gl, camera]);

  useEffect(() => {
    return () => {
      foods.forEach(food => scene.remove(food));
    };
  }, []);

  const smoothers = useRef({
    leftPec: new YUKA.Smoother(8),  // Pectoral fins (sides)
    rightPec: new YUKA.Smoother(8),
    dorsal: new YUKA.Smoother(6),   // Top fins
    anal: new YUKA.Smoother(6),     // Bottom fins
    tail: new YUKA.Smoother(4),    // Tail fins (faster response)
    leftGill: new YUKA.Smoother(4),
    rightGill: new YUKA.Smoother(4)
  });

  // Reusable vectors (create once, reuse to avoid garbage collection)
  const currentValue = new YUKA.Vector3();
  const smoothedValue = new YUKA.Vector3();

  // Primary animation: Spine chain swimming motion
  const updateSpineAnimation = useCallback((delta, isResting, speedRatio) => {
    spineChain.current.forEach((bone, index) => {
      if (!bone) return;

      const restRotation = restPose.current.get(bone.name);
      const totalBones = spineChain.current.length;
      const x = index / (totalBones - 1);

      // Calculate swimming motion
      const attenuation = controls.headMovementScale + (1 - controls.headMovementScale) * x ** 2;
      const currentAmplitude = controls.amplitude * speedRatio;
      const angle = currentAmplitude * attenuation *
        Math.sin(2 * Math.PI * controls.waveFraction * x + theta.current);

      bone.rotation.z = restRotation.z + angle * controls.bodyMovementScale;
    });
  }, [controls]);

  const updateSecondaryAnimations = useCallback((elapsedTime) => {
    if (!modelRef.current) return;

    const isResting = fishAI.current?.stateMachine.currentState?.constructor.name === 'RestState';
    const speedRatio = fishAI.current ? fishAI.current.getSpeed() / fishAI.current.maxSpeed : 0;

    modelRef.current.traverse((bone) => {
      if (!bone.isBone) return;
      
      const restRotation = restPose.current.get(bone.name) || { x: 0, y: 0, z: 0 };

      // Gill movement
      if (bone.name.includes('Gill')) {
        const isLeft = bone.name.includes('L');
        const smoother = isLeft ? smoothers.current.leftGill : smoothers.current.rightGill;
        
        // Base oscillation
        const gillTheta = elapsedTime * controls.gillMovementSpeed;
        // Phase offset for left/right counter-motion
        const phaseOffset = isLeft ? 0 : Math.PI;
        
        // Create more complex motion by combining waves
        currentValue.set(
          0,
          Math.abs(Math.cos(gillTheta * 0.7)) * controls.gillMovementAmount * 0.3,
          0
        );

        // Apply smoothing
        smoother.calculate(currentValue, smoothedValue);
        
        // Apply the smoothed rotation
        bone.rotation.z = restRotation.z + (isLeft ? smoothedValue.x : -smoothedValue.x);
        bone.rotation.y = restRotation.y + smoothedValue.y;
        return;
      }

      // // Pectoral Fins (side fins)
      // if (bone.name.includes('PecFin')) {
      //   const isLeft = bone.name.includes('L');
      //   const smoother = isLeft ? smoothers.current.leftPec : smoothers.current.rightPec;
      //   const phaseOffset = isLeft ? 0 : Math.PI; // Opposite motion for left/right

      //   // Base motion with speed influence
      //   const theta = elapsedTime * controls.pecFinIdleSpeed;
      //   const baseAmount = isResting ? 
      //     controls.pecFinIdleAmount : 
      //     controls.pecFinIdleAmount + speedRatio * controls.pecFinSwimAmount;

      //   // Combine primary and secondary waves
      //   currentValue.set(
      //     Math.sin(theta + phaseOffset) * baseAmount,
      //     Math.cos(theta * 0.1) * baseAmount * 0.5,
      //     Math.sin(theta * 1.3) * baseAmount * 0.3
      //   );

      //   // Apply smoothing
      //   smoother.calculate(currentValue, smoothedValue);
        
      //   // Apply rotations
      //   bone.rotation.z = restRotation.z + smoothedValue.x;
      //   if (!isResting) {
      //     bone.rotation.y = restRotation.y + smoothedValue.y * speedRatio;
      //     bone.rotation.x = restRotation.x + smoothedValue.z * speedRatio;
      //   }
      //   return;
      // }

      // Dorsal Fins (top fins)
      if (bone.name.includes('DorsFin')) {
        const theta = elapsedTime * controls.dorsFinWaveSpeed;
        const baseAmount = isResting ? 
          controls.dorsFinWaveAmount * 0.5 : 
          controls.dorsFinWaveAmount * (1 + speedRatio);

        currentValue.set(
          Math.sin(theta) * baseAmount,
          Math.cos(theta * 0.8) * baseAmount * 0.3,
          0
        );

        smoothers.current.dorsal.calculate(currentValue, smoothedValue);
        bone.rotation.z = restRotation.z + smoothedValue.x;
        bone.rotation.y = restRotation.y + smoothedValue.y;
        return;
      }

      // Anal Fins (bottom fins)
      if (bone.name.includes('AnalFin')) {
        const theta = elapsedTime * controls.analFinSpeed;
        const baseAmount = isResting ? 
          controls.analFinAmount * 0.7 : 
          controls.analFinAmount * (1 + speedRatio * 0.3);

        currentValue.set(
          Math.sin(theta * 1.2) * baseAmount,
          Math.cos(theta) * baseAmount * 0.4,
          0
        );

        smoothers.current.anal.calculate(currentValue, smoothedValue);
        bone.rotation.z = restRotation.z + smoothedValue.x;
        bone.rotation.y = restRotation.y + smoothedValue.y;
      }

      // Tail fins (more responsive, follows body motion)
      if (bone.name.includes('TailA') || bone.name.includes('TailB')) {
        const theta = elapsedTime * controls.waveSpeed;
        const baseAmount = isResting ? 
          controls.restingTailAmplitude : 
          controls.amplitude * (0.5 + speedRatio * 0.5);

        currentValue.set(
          Math.sin(theta) * baseAmount,
          Math.cos(theta * 1.2) * baseAmount * 0.3,
          0
        );

        smoothers.current.tail.calculate(currentValue, smoothedValue);
        bone.rotation.z = restRotation.z + smoothedValue.x;
        bone.rotation.y = restRotation.y + smoothedValue.y;
      }
    });
  }, [controls]);


  // Update YUKA and fish motion
  useFrame((state, delta) => {
    if (!modelRef.current || !fishAI.current || spineChain.current.length === 0) return;

    // Update YUKA
    const deltaTime = yukaTime.current.update().getDelta();
    entityManager.current.update(deltaTime);

    // Get current state and speed
    const currentState = fishAI.current.stateMachine.currentState;
    const isResting = currentState?.constructor.name === 'RestState';
    const speedRatio = fishAI.current.getSpeed() / fishAI.current.maxSpeed;

    // Update animation phases
    theta.current += delta * controls.waveSpeed;

    // Check for food consumption
    if (fishAI.current.foodTarget) {
      const distanceToFood = fishAI.current.position.distanceTo(fishAI.current.foodTarget.position);

      if (distanceToFood < 1) {
        // Remove the food
        scene.remove(fishAI.current.foodTarget);
        setFoods(prevFoods => prevFoods.filter(f => f !== fishAI.current.foodTarget));
        fishAI.current.foodTarget = null;

        // Change state to rest
        fishAI.current.stateMachine.changeTo('Rest');
      }
    }

    // Update animations
    updateSpineAnimation(delta, isResting, speedRatio);
    updateSecondaryAnimations(state.clock.elapsedTime);




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
          {/* <meshBasicMaterial color="red" wireframe /> */}
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
      {/* <WanderDebug fish={fishAI} /> */}
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
          enableRotate={true}
          enablePan={true}
          minZoom={0}
          maxZoom={100}
          target={[0, 0, 0]}
        />
      </Canvas>
      <Loader />
    </div>
  );
};


export default App;