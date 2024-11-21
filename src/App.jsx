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

import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';

import { Html } from '@react-three/drei';

// Replace the BasicText component with this:
const BasicText = () => {
  const textRef = useRef();
  const [font, setFont] = useState(null);

  useEffect(() => {
    const loader = new FontLoader();
    loader.load('/fonts/Inter_Bold.json', (loadedFont) => {
      setFont(loadedFont);
    });
  }, []);

  useEffect(() => {
    if (!font || !textRef.current) return;

    // Split text into words
    const words = 'Where there is a will, there is a way'.split(' ');
    const maxWidth = 120; // Maximum width for text wrapping
    const lines = [];
    let currentLine = [];
    
    
    // Build lines
    words.forEach(word => {
      const testLine = [...currentLine, word].join(' ');
      const tempGeometry = new TextGeometry(testLine, {
        font: font,
        size: 12,
        height: 2,
        curveSegments: 10,
      });
      tempGeometry.computeBoundingBox();
      const lineWidth = tempGeometry.boundingBox.max.x - tempGeometry.boundingBox.min.x;
      
      if (lineWidth > maxWidth && currentLine.length > 0) {
        lines.push(currentLine.join(' '));
        currentLine = [word];
      } else {
        currentLine.push(word);
      }
      tempGeometry.dispose();
    });
    if (currentLine.length > 0) {
      lines.push(currentLine.join(' '));
    }

    // Create geometry for all lines
    const geometry = new TextGeometry(lines.join('\n'), {
      font: font,
      size: 8,
      height: 2,
      curveSegments: 12,
      bevelEnabled: false
    });

    geometry.computeVertexNormals();
    geometry.center();

    geometry.computeBoundingBox();
    const width = geometry.boundingBox.max.x - geometry.boundingBox.min.x;
    const centerOffset = -0.5 * width;
    textRef.current.geometry = geometry;
    textRef.current.position.x = centerOffset;

  }, [font]);

  return (
    <mesh 
      ref={textRef} 
      position={[0, 5, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <meshLambertMaterial 
        color={0x666666}
        metalness={0.1}
        roughness={0.3}
        side={THREE.FrontSide} // Render both sides of the geometry
      />
    </mesh>
  );
};


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
    this.maxForce = 1;
    this.maxTurnRate = 0.1;
    this.smoothingFactor = 0.5;

    // Initialize behaviors
    this.wanderBehavior = new YUKA.WanderBehavior();
    this.wanderBehavior.jitter = 0.1;
    this.wanderBehavior.radius = 2;
    this.wanderBehavior.distance = 6;
    this.wanderBehavior.weight = 0.3;

    this.arriveBehavior = new YUKA.ArriveBehavior();
    this.arriveBehavior.deceleration = 3;
    this.arriveBehavior.active = false;
    this.arriveBehavior.weight = 0.1;

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


const Floor = () => {


  const floorControls = useControls('Floor', {
    floorY: { value: -5, min: -20, max: 0, step: 0.1 },
    shadowOpacity: { value: 0.2, min: 0, max: 1, step: 0.05 },
  });
  

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, floorControls.floorY, 0]} receiveShadow>
      <planeGeometry args={[1000, 1000]} />
      <meshStandardMaterial 
        transparent
        opacity={floorControls.shadowOpacity}
        roughness={0.7}
      />
    </mesh>
  );
};




const Model = ({ url }) => {

  


  const controls = useControls('Model', {
    // Swimming parameters
    amplitude: { value: 0.1, min: 0.1, max: 1, step: 0.1 },
    waveFraction: { value: 1.6, min: 0.5, max: 2, step: 0.1 },
    waveSpeed: { value: 2.5, min: 0.1, max: 5, step: 0.1 },
    headMovementScale: { value: 1.0, min: 0, max: 1, step: 0.05 },
    bodyMovementScale: { value: 0.1, min: 0, max: 1, step: 0.05 },

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
  const subsurfaceMap = useLoader(TextureLoader, '/models/textures/koi_showa_subsur.png');

  // Apply textures when model loads
  useEffect(() => {
    if (!modelRef.current) return;

    // Traverse the model to find meshes
    modelRef.current.traverse((child) => {
      if (child.isMesh) {
        child.material = new THREE.MeshPhysicalMaterial({
          //map: diffuseMap,
          bumpMap: bumpMap,
          bumpScale: 1.5,
          roughness: 0.9,
          metalness: 0.1,
          envMapIntensity: 0,

          // Add subsurface scattering properties
          transmission: 0.2,
          thickness: 0.8,
          
          // Use subsurface map
          transmissionMap: subsurfaceMap,

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
      // Calculate turn rate from angular velocity
      const turnRate = entity.velocity.length() > 0.001 ? 
        Math.atan2(entity.velocity.x, entity.velocity.z) - renderComponent.rotation.y :
        0;
        
      // Calculate spine curve based on turn rate
      spineChain.current.forEach((bone, index) => {
        const x = 1 + index / (spineChain.current.length - 1);
        
        // Progressive curve - stronger at tail
        const turnInfluence = Math.pow(x, 2); // Quadratic increase toward tail
        
        // Get stored rest pose
        const restRotation = restPose.current.get(bone.name) || { x: 0, y: 0, z: 0 };
        
        // Apply turn-influenced curve
        const turnAmount = turnRate * turnInfluence * 2; // Adjust multiplier as needed
        bone.rotation.y = restRotation.y + turnAmount;
        
        // Add counter-rotation to maintain smooth flow
        const counterRotation = -turnAmount * 0.3; // Reduced counter-effect
        bone.rotation.x = restRotation.x + counterRotation;
      });
    
      // Update position with offset from center of mass
      const offset = new THREE.Vector3(0, 0, 5.58); // Adjust based on model
      offset.applyQuaternion(renderComponent.quaternion);
      renderComponent.position.copy(entity.position).add(offset);
    
      // Smooth rotation transition
      if (entity.velocity.length() > 0.001) {
        const targetAngle = Math.atan2(entity.velocity.x, entity.velocity.z);
        const currentAngle = renderComponent.rotation.y;
        
        // Interpolate rotation for smoother turns
        const rotationSpeed = 5; // Adjust as needed
        renderComponent.rotation.y = currentAngle + 
          (((targetAngle - currentAngle + Math.PI) % (Math.PI * 2)) - Math.PI) * 
          Math.min(1, rotationSpeed * entity.velocity.length());
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


  useEffect(() => {
    if (!modelRef.current) return;
  
    console.log('=== All Bones in Model ===');
    modelRef.current.traverse((child) => {
      if (child.isBone) {
        console.log(`Found bone: ${child.name}`);
      }
    });
  
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
    let foundBones = new Set();
  
    modelRef.current.traverse((child) => {
      if (child.isBone) {
        const index = spineOrder.indexOf(child.name);
        if (index !== -1) {
          bones[index] = child;
          foundBones.add(child.name);
          restPose.current.set(child.name, {
            x: child.rotation.x,
            y: child.rotation.y,
            z: child.rotation.z
          });
        }
      }
    });
  
    console.log('=== Spine Chain Analysis ===');
    console.log('Found bones:', Array.from(foundBones));
    console.log('Missing bones:', spineOrder.filter(name => !foundBones.has(name)));
    console.log('Final spine chain:', bones.filter(Boolean).map(bone => bone.name));
  
    spineChain.current = bones.filter(Boolean);
  }, []);

  const theta = useRef(0);

  // Initialize spine chain and store rest pose
  useEffect(() => {
    if (!modelRef.current) return;

    const spineOrder = [
      'Nose_end',
      'Nose',
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
    const foodGeometry = new THREE.BoxGeometry(1, 1, 1);
    const foodMaterial = new THREE.MeshBasicMaterial({ color: 0x666666 });
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
  
      if (isResting) {
        // Resting behavior remains the same
        const idleWave = Math.sin(theta.current * 0.5) * controls.restingTailAmplitude * x;
        bone.rotation.z = restRotation.z + idleWave;
      } else {
        // Enhanced swimming motion
        
        // Amplitude envelope - increases towards tail following a power curve
        const amplitudeEnvelope = Math.pow(x, 1.5);
        
        // Wave number increases towards tail for better propulsion
        const localWaveNumber = controls.waveFraction * (1 + x * 0.5);
        
        // Phase speed increases towards tail
        const localPhaseSpeed = theta.current * (1 + x * 0.3);
        
        // Main undulation wave
        const undulation = Math.sin(2 * Math.PI * localWaveNumber * x - localPhaseSpeed);
        
        // Add secondary wave components
        const secondaryWave = Math.sin(4 * Math.PI * localWaveNumber * x - localPhaseSpeed * 1.5) * 0.3;
        
        // Combine waves with amplitude modulation
        const waveMotion = (undulation + secondaryWave) * 
          controls.amplitude * 
          amplitudeEnvelope * 
          speedRatio;
        
        // Add rotational component that follows the wave's derivative
        const rotationComponent = Math.cos(2 * Math.PI * localWaveNumber * x - localPhaseSpeed) * 
          controls.bodyMovementScale * 
          speedRatio * 
          0.3;
        
        // Apply combined motion
        bone.rotation.z = restRotation.z + waveMotion;
        bone.rotation.y = restRotation.y + rotationComponent;
        
        // Add slight counter-rotation to maintain balance
        bone.rotation.x = restRotation.x - Math.abs(waveMotion) * 0.1;
      }
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
      <Floor />
      <BasicText />
      {/* <BoneDebugger spineChain={spineChain} /> */}

      {/* Include the visual debugger */}
      {/* <WanderDebug fish={fishAI} /> */}
    </>
  );
};


const constrainDistance = (pos, anchor, constraint) => {
  const diff = new THREE.Vector3().subVectors(pos, anchor);
  if (diff.length() > constraint) {
    return anchor.clone().add(diff.normalize().multiplyScalar(constraint));
  }
  return pos.clone();
};

const WanderDebug = ({ vehicle }) => {
  const wanderCircleRef = useRef();
  const wanderTargetRef = useRef();
  const vehiclePositionRef = useRef();

  useFrame(() => {
    if (!vehicle.current) return;

    // Get the wander behavior
    const wanderBehavior = vehicle.current.steering.behaviors.find(
      behavior => behavior instanceof YUKA.WanderBehavior
    );

    if (wanderBehavior) {
      const wanderRadius = wanderBehavior.radius;
      const wanderDistance = wanderBehavior.distance;
      
      // Calculate wander circle center
      const circleCenter = vehicle.current.velocity.clone()
        .normalize()
        .multiplyScalar(wanderDistance)
        .add(vehicle.current.position);

      // Update debug visuals
      wanderCircleRef.current.position.copy(circleCenter);
      wanderCircleRef.current.scale.setScalar(wanderRadius);
      vehiclePositionRef.current.position.copy(vehicle.current.position);
    }
  });

  return (
    <>
      {/* Wander circle visualization */}
      <mesh ref={wanderCircleRef}>
        <circleGeometry args={[1, 32]} />
        <meshBasicMaterial color="yellow" wireframe />
      </mesh>

      {/* Vehicle position marker */}
      <mesh ref={vehiclePositionRef}>
        <circleGeometry args={[0.2, 16]} />
        <meshBasicMaterial color="blue" wireframe />
      </mesh>
    </>
  );
};


class Fish2DEntity extends YUKA.Vehicle {
  constructor() {
    super();
    
    // Configure vehicle properties
    this.maxSpeed = 2;
    this.maxForce = 0.3; // Reduced for smoother turning
    
    // Add wander behavior with tuned parameters
    const wanderBehavior = new YUKA.WanderBehavior();
    wanderBehavior.radius = 4;      // Larger radius for wider turns
    wanderBehavior.distance = 6;    // Further ahead for more natural anticipation
    wanderBehavior.jitter = 0.8;    // Increased randomness
    
    this.steering.add(wanderBehavior);
  }

  update(delta) {
    // Constrain to 2D plane
    this.position.y = 0;
    this.velocity.y = 0;
    
    super.update(delta);
  }
}

const Fish2D = () => {
  const entityManager = useRef(new YUKA.EntityManager());
  const time = useRef(new YUKA.Time());
  const fish = useRef();
  
  const chainRef = useRef({
    joints: [],
    segmentLength: 0.5,
    numSegments: 12
  });

  const debugRef = useRef({
    group: new THREE.Group(),
    spheres: [],
    lines: null
  });

  // Debug controls
  const debugControls = useControls('Fish Debug', {
    showWanderCircle: true,
    showSegments: true
  });

  useEffect(() => {
    // Initialize fish entity
    fish.current = new Fish2DEntity();
    entityManager.current.add(fish.current);

    // Initialize joint chain
    const chain = chainRef.current;
    const group = debugRef.current.group;
    
    for (let i = 0; i < chain.numSegments; i++) {
      chain.joints.push(new THREE.Vector3(i * chain.segmentLength, 0, 0));
      
      if (debugControls.showSegments) {
        const sphere = new THREE.Mesh(
          new THREE.SphereGeometry(0.1, 16, 16),
          new THREE.MeshBasicMaterial({ 
            color: i === 0 ? 0xff0000 : 0xffffff,
            wireframe: true 
          })
        );
        sphere.position.copy(chain.joints[i]);
        group.add(sphere);
        debugRef.current.spheres.push(sphere);
      }
    }

    // Create connecting line
    const lineGeometry = new THREE.BufferGeometry();
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffff00 });
    const line = new THREE.Line(lineGeometry, lineMaterial);
    group.add(line);
    debugRef.current.lines = line;
  }, []);

  useFrame((state, delta) => {
    // Update YUKA
    const deltaTime = time.current.update().getDelta();
    entityManager.current.update(deltaTime);

    // Update joint chain based on fish position
    if (fish.current) {
      const chain = chainRef.current;
      
      // Update head position to follow fish
      chain.joints[0].copy(fish.current.position);
      
      // Update subsequent joints
      for (let i = 1; i < chain.numSegments; i++) {
        const prev = chain.joints[i - 1];
        const curr = chain.joints[i];
        
        const dir = curr.clone().sub(prev).normalize();
        curr.copy(prev).add(dir.multiplyScalar(chain.segmentLength));
      }

      // Update visuals
      debugRef.current.spheres.forEach((sphere, i) => {
        sphere.position.copy(chain.joints[i]);
      });
      debugRef.current.lines.geometry.setFromPoints(chain.joints);
    }
  });

  return (
    <>
      <primitive object={debugRef.current.group} />
      {<WanderDebug vehicle={fish} />}
    </>
  );
};

const App = () => {

  const lightingControls = useControls('Lighting', {
    shadowSize: { value: 50, min: 10, max: 100, step: 5 },
    ambientIntensity: { value: 0.6, min: 0, max: 2, step: 0.1 },
    keyLightIntensity: { value: 1.9, min: 0, max: 3, step: 0.1 },
    keyLightX: { value: 6, min: -20, max: 20, step: 1 },
    keyLightY: { value: 13, min: -20, max: 20, step: 1 },
    keyLightZ: { value: 2, min: -20, max: 20, step: 1 },
    fillLightIntensity: { value: 0.8, min: 0, max: 2, step: 0.1 },
    rimLightIntensity: { value: 0.2, min: 0, max: 2, step: 0.1 },
    hemiIntensity: { value: 0.3, min: 0, max: 2, step: 0.1 },
    shadowBias: { value: -0.0005, min: -0.01, max: 0.01, step: 0.0001 },
    shadowRadius: { value: 8, min: 0, max: 20, step: 0.1 },
  });

  return (
    <div className='w-screen h-screen'>
      <Leva collapsed />
      <Canvas
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
        shadows
      >
        <OrthographicCamera
          makeDefault
          position={[0, 0, 10]}
          zoom={100}
          near={0.1}
          far={1000}
        />

        <ambientLight intensity={1} />
        
        <Fish2D />

        {/* Remove OrbitControls for now to make mouse interaction easier */}
      </Canvas>
      <Loader />
    </div>
  );
};


export default App;