<script lang="ts">
	import type { QuizQuestionVrWhack } from '$lib/quiz/types';

	type Props = {
		question: QuizQuestionVrWhack;
		value: number;
		onChange: (next: number) => void;
		onSubmit?: (payload: number) => void;
	};

	let { question, value, onChange, onSubmit }: Props = $props();

	let yaw = $state(0); // radians
	let pitch = $state(0); // radians
	let roll = $state(0); // radians
	let motionQuat = $state<{ x: number; y: number; z: number; w: number } | null>(null);
	let motionTargetQuat = $state<{ x: number; y: number; z: number; w: number } | null>(null);
	let motionSource = $state<'none' | 'deviceorientation' | 'deviceorientationabsolute' | 'sensor'>('none');
	let screenOrientRad = $state(0);

	let usingMotion = $state(false);
	let motionDenied = $state(false);
	let motionSeen = $state(false);
	let lastMotionAt = $state(0);
	let motionError = $state<string | null>(null);
	let autoMotionTried = $state(false);

	let lastQid = $state<string | null>(null);
	let hitCount = $state(0);

	let targetIndex = $state(0);
	let targetSeed = $state(0);

	const cfg = $derived((question as any)?.vrwhack ?? {});
	const targets = $derived<Array<{ src: string; alt?: string }>>(
		Array.isArray(cfg.targets) ? cfg.targets : []
	);
	const hint = $derived(String(cfg.hint ?? 'Look around and tap the target as fast as you can.'));
	const fovDeg = $derived.by(() => {
		const deg = Number(cfg.fovDeg ?? 75);
		return Number.isFinite(deg) ? Math.max(45, Math.min(110, deg)) : 75;
	});
	const targetRadius = $derived.by(() => {
		const r = Number(cfg.targetRadius ?? 6);
		return Number.isFinite(r) ? Math.max(3, Math.min(12, r)) : 6;
	});
	const targetSize = $derived.by(() => {
		const s = Number(cfg.targetSize ?? 0.7);
		return Number.isFinite(s) ? Math.max(0.35, Math.min(1.5, s)) : 0.7;
	});

	function normalizeAngle(a: number) {
		let x = a;
		while (x > Math.PI) x -= Math.PI * 2;
		while (x < -Math.PI) x += Math.PI * 2;
		return x;
	}

	function clamp(n: number, min: number, max: number) {
		return Math.max(min, Math.min(max, n));
	}

	function nextTarget() {
		// Randomize which image/texture we use, and bump a seed so the 3D scene repositions.
		targetIndex = targets.length ? Math.floor(Math.random() * targets.length) : 0;
		targetSeed = (targetSeed + 1) % 1_000_000;
	}

	function getScreenOrientationRad(): number {
		if (typeof window === 'undefined') return 0;
		const anyWin = window as any;
		const angle = Number(anyWin?.screen?.orientation?.angle ?? anyWin?.orientation ?? 0);
		return Number.isFinite(angle) ? (angle * Math.PI) / 180 : 0;
	}

	$effect(() => {
		if (typeof window === 'undefined') return;
		const update = () => {
			screenOrientRad = getScreenOrientationRad();
		};
		update();
		window.addEventListener('orientationchange', update, { passive: true });
		try {
			(window as any).screen?.orientation?.addEventListener?.('change', update);
		} catch {
			// ignore
		}
		return () => {
			window.removeEventListener('orientationchange', update);
			try {
				(window as any).screen?.orientation?.removeEventListener?.('change', update);
			} catch {
				// ignore
			}
		};
	});

	$effect(() => {
		// Auto-enable motion only when no permission prompt is required.
		if (typeof window === 'undefined') return;
		if (autoMotionTried) return;
		autoMotionTried = true;
		const anyWin = window as any;
		const needsPermission =
			(typeof anyWin?.DeviceOrientationEvent?.requestPermission === 'function' ||
				typeof anyWin?.DeviceMotionEvent?.requestPermission === 'function') ?? false;
		if (!needsPermission) {
			usingMotion = true;
		}
	});

	$effect(() => {
		const qid = String(question?.id ?? '');
		if (lastQid === null) {
			lastQid = qid;
			hitCount = typeof value === 'number' && Number.isFinite(value) ? value : 0;
			nextTarget();
			return;
		}
		if (qid && qid !== lastQid) {
			lastQid = qid;
			hitCount = 0;
			onChange(0);
			onSubmit?.(0);
			nextTarget();
			motionDenied = false;
			usingMotion = false;
		}
	});

	$effect(() => {
		// Keep internal hitCount in sync if parent changes it.
		if (typeof value !== 'number' || !Number.isFinite(value)) return;
		if (value !== hitCount) hitCount = value;
	});

	async function enableMotion() {
		motionDenied = false;
		motionSeen = false;
		lastMotionAt = 0;
		motionError = null;
		try {
			const anyWindow = window as any;
			const anyDeviceOrientationEvent = anyWindow?.DeviceOrientationEvent;
			if (
				anyDeviceOrientationEvent &&
				typeof anyDeviceOrientationEvent.requestPermission === 'function'
			) {
				const res = await anyDeviceOrientationEvent.requestPermission();
				if (res !== 'granted') {
					motionDenied = true;
					usingMotion = false;
					return;
				}
			}
			const anyDeviceMotionEvent = anyWindow?.DeviceMotionEvent;
			if (anyDeviceMotionEvent && typeof anyDeviceMotionEvent.requestPermission === 'function') {
				const res = await anyDeviceMotionEvent.requestPermission();
				if (res !== 'granted') {
					motionDenied = true;
					usingMotion = false;
					return;
				}
			}
			usingMotion = true;
		} catch {
			motionDenied = true;
			usingMotion = false;
		}
	}

	$effect(() => {
		if (typeof window === 'undefined') return;
		if (!usingMotion) return;

		let timeout = 0;
		let fallbackTimer = 0;
		let stopped = false;
		let sensor: any | null = null;
		let chooseUntil = (performance?.now ? performance.now() : Date.now()) + 600;

		const quatMultiply = (
			a: { x: number; y: number; z: number; w: number },
			b: { x: number; y: number; z: number; w: number }
		) => {
			return {
				x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
				y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
				z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
				w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
			};
		};

		const quatFromAxisAngle = (ax: number, ay: number, az: number, angleRad: number) => {
			const half = angleRad / 2;
			const s = Math.sin(half);
			return { x: ax * s, y: ay * s, z: az * s, w: Math.cos(half) };
		};

		const quatFromEulerYXZ = (x: number, y: number, z: number) => {
			// Matches THREE.Quaternion.setFromEuler for order 'YXZ'
			const halfX = x / 2;
			const halfY = y / 2;
			const halfZ = z / 2;
			const c1 = Math.cos(halfX);
			const c2 = Math.cos(halfY);
			const c3 = Math.cos(halfZ);
			const s1 = Math.sin(halfX);
			const s2 = Math.sin(halfY);
			const s3 = Math.sin(halfZ);
			return {
				x: s1 * c2 * c3 + c1 * s2 * s3,
				y: c1 * s2 * c3 - s1 * c2 * s3,
				z: c1 * c2 * s3 - s1 * s2 * c3,
				w: c1 * c2 * c3 + s1 * s2 * s3
			};
		};

		const quatToEulerYXZ = (q: { x: number; y: number; z: number; w: number }) => {
			// Build rotation matrix (column-major like THREE.Matrix4) and apply THREE.Euler.setFromRotationMatrix for order 'YXZ'.
			const x = q.x,
				y = q.y,
				z = q.z,
				w = q.w;
			const m11 = 1 - 2 * (y * y + z * z);
			const m13 = 2 * (x * z + y * w);
			const m21 = 2 * (x * y + z * w);
			const m22 = 1 - 2 * (x * x + z * z);
			const m23 = 2 * (y * z - x * w);
			const m31 = 2 * (x * z - y * w);
			const m33 = 1 - 2 * (x * x + y * y);

			const pitchRad = Math.asin(-clamp(m23, -1, 1));
			let yawRad = 0;
			let rollRad = 0;
			if (Math.abs(m23) < 0.9999999) {
				yawRad = Math.atan2(m13, m33);
				rollRad = Math.atan2(m21, m22);
			} else {
				yawRad = Math.atan2(-m31, m11);
				rollRad = 0;
			}
			return { yawRad, pitchRad, rollRad };
		};

		const quatDot = (
			a: { x: number; y: number; z: number; w: number },
			b: { x: number; y: number; z: number; w: number }
		) => a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;

		const quatNormalize = (q: { x: number; y: number; z: number; w: number }) => {
			const len = Math.hypot(q.x, q.y, q.z, q.w);
			if (!Number.isFinite(len) || len <= 0) return { x: 0, y: 0, z: 0, w: 1 };
			return { x: q.x / len, y: q.y / len, z: q.z / len, w: q.w / len };
		};

		const quatSlerp = (
			a: { x: number; y: number; z: number; w: number },
			bIn: { x: number; y: number; z: number; w: number },
			t: number
		) => {
			let b = bIn;
			let cosHalfTheta = quatDot(a, b);
			// Ensure shortest path
			if (cosHalfTheta < 0) {
				b = { x: -b.x, y: -b.y, z: -b.z, w: -b.w };
				cosHalfTheta = -cosHalfTheta;
			}
			if (cosHalfTheta >= 0.9995) {
				// Linear fallback
				return quatNormalize({
					x: a.x + (b.x - a.x) * t,
					y: a.y + (b.y - a.y) * t,
					z: a.z + (b.z - a.z) * t,
					w: a.w + (b.w - a.w) * t
				});
			}
			const halfTheta = Math.acos(clamp(cosHalfTheta, -1, 1));
			const sinHalfTheta = Math.sqrt(1.0 - cosHalfTheta * cosHalfTheta);
			if (Math.abs(sinHalfTheta) < 0.001) {
				return quatNormalize({
					x: a.x * 0.5 + b.x * 0.5,
					y: a.y * 0.5 + b.y * 0.5,
					z: a.z * 0.5 + b.z * 0.5,
					w: a.w * 0.5 + b.w * 0.5
				});
			}
			const ratioA = Math.sin((1 - t) * halfTheta) / sinHalfTheta;
			const ratioB = Math.sin(t * halfTheta) / sinHalfTheta;
			return quatNormalize({
				x: a.x * ratioA + b.x * ratioB,
				y: a.y * ratioA + b.y * ratioB,
				z: a.z * ratioA + b.z * ratioB,
				w: a.w * ratioA + b.w * ratioB
			});
		};

		const setMotionTarget = (
			source: 'deviceorientation' | 'deviceorientationabsolute' | 'sensor',
			qIn: { x: number; y: number; z: number; w: number }
		) => {
			const now = performance?.now ? performance.now() : Date.now();
			const withinChooseWindow = now <= chooseUntil;

			// Lock to a single source to avoid jitter from competing event streams.
			if (motionSource === 'none') {
				motionSource = source;
			} else if (motionSource !== source) {
				// Prefer absolute over non-absolute during the initial window.
				if (withinChooseWindow && source === 'deviceorientationabsolute') {
					motionSource = source;
				} else {
					return;
				}
			}

			const q = quatNormalize(qIn);
			motionTargetQuat = q;

			// Also keep derived yaw/pitch/roll updated for spawn logic / fallback paths.
			const e = quatToEulerYXZ(q);
			yaw = normalizeAngle(e.yawRad);
			pitch = clamp(e.pitchRad, -Math.PI / 2, Math.PI / 2);
			roll = normalizeAngle(e.rollRad);
			motionSeen = true;
			lastMotionAt = Date.now();
		};

		const startGenericOrientationSensor = () => {
			try {
				if (!window.isSecureContext) {
					motionError = 'Motion sensors require HTTPS.';
					return false;
				}
				const AnyWindow = window as any;
				const SensorCtor =
					AnyWindow.AbsoluteOrientationSensor ?? AnyWindow.RelativeOrientationSensor;
				if (!SensorCtor) return false;

				sensor = new SensorCtor({ frequency: 60 });
				sensor.addEventListener('reading', () => {
					if (stopped) return;
					const q = sensor?.quaternion;
					if (!q || q.length !== 4) return;
					const x = Number(q[0]);
					const y = Number(q[1]);
					const z = Number(q[2]);
					const w = Number(q[3]);
					if (![x, y, z, w].every(Number.isFinite)) return;
					// Apply screen orientation correction so portrait/landscape doesn't invert axes.
					const orientQ = quatFromAxisAngle(0, 0, 1, -screenOrientRad);
					const corrected = quatMultiply({ x, y, z, w }, orientQ);
					setMotionTarget('sensor', corrected);
				});
				sensor.addEventListener('error', (e: any) => {
					if (stopped) return;
					motionError = String(e?.error?.name ?? e?.name ?? 'Sensor error');
				});
				sensor.start();
				motionError = null;
				return true;
			} catch {
				motionError = 'Orientation sensor unavailable; trying legacy events.';
				sensor = null;
				return false;
			}
		};

		const onOri = (e: DeviceOrientationEvent, source: 'deviceorientation' | 'deviceorientationabsolute') => {
			// Use a DeviceOrientationControls-style mapping so portrait/landscape behave correctly.
			const alpha = Number((e as any).alpha);
			const beta = Number((e as any).beta);
			const gamma = Number((e as any).gamma);
			const compass = Number((e as any).webkitCompassHeading);
			if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return;
			// If this is the "absolute" stream but not actually absolute, ignore it.
			if (source === 'deviceorientationabsolute' && (e as any).absolute === false) return;

			// Prefer alpha when present; fall back to webkitCompassHeading on iOS.
			let alphaDeg = alpha;
			if (!Number.isFinite(alphaDeg) && Number.isFinite(compass)) {
				// Convert compass heading (clockwise from North) to an equivalent alpha.
				alphaDeg = 360 - compass;
			}
			if (!Number.isFinite(alphaDeg)) return;

			const alphaRad = (alphaDeg * Math.PI) / 180;
			const betaRad = (beta * Math.PI) / 180;
			const gammaRad = (gamma * Math.PI) / 180;

			// Equivalent to: euler.set(beta, alpha, -gamma, 'YXZ')
			let q = quatFromEulerYXZ(betaRad, alphaRad, -gammaRad);
			// Camera points out the back of the device; rotate -90° around X.
			const q1 = { x: -Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 };
			q = quatMultiply(q, q1);
			// Compensate for screen orientation (portrait/landscape).
			const q0 = quatFromAxisAngle(0, 0, 1, -screenOrientRad);
			q = quatMultiply(q, q0);

			setMotionTarget(source, q);
		};

		// Prefer legacy orientation events (best cross-device behavior). If no events arrive,
		// fall back to the Generic Sensor API.
		const onDeviceOrientation = (e: DeviceOrientationEvent) => onOri(e, 'deviceorientation');
		const onDeviceOrientationAbs = (e: DeviceOrientationEvent) => onOri(e, 'deviceorientationabsolute');
		window.addEventListener('deviceorientation', onDeviceOrientation, { passive: true });
		window.addEventListener('deviceorientationabsolute' as any, onDeviceOrientationAbs as any, { passive: true } as any);
		fallbackTimer = window.setTimeout(() => {
			if (stopped) return;
			if (motionSeen) return;
			const started = startGenericOrientationSensor();
			if (started) {
				motionSource = 'sensor';
				window.removeEventListener('deviceorientation', onDeviceOrientation);
				window.removeEventListener('deviceorientationabsolute' as any, onDeviceOrientationAbs as any);
			}
		}, 800);

		// If we still don't see data after a moment, show a useful hint.
		timeout = window.setTimeout(() => {
			if (stopped) return;
			if (!motionSeen && !motionDenied && !motionError) {
				motionError = 'No sensor events received (try Safari / check browser permissions).';
			}
		}, 1500);

		return () => {
			stopped = true;
			if (timeout) window.clearTimeout(timeout);
			if (fallbackTimer) window.clearTimeout(fallbackTimer);
			try {
				sensor?.stop?.();
			} catch {
				// ignore
			}
			window.removeEventListener('deviceorientation', onDeviceOrientation);
			window.removeEventListener('deviceorientationabsolute' as any, onDeviceOrientationAbs as any);
		};
	});

	function lookDragAction(node: HTMLElement) {
		let dragging = false;
		let lastX = 0;
		let lastY = 0;

		const onDown = (e: PointerEvent) => {
			dragging = true;
			lastX = e.clientX;
			lastY = e.clientY;
			try {
				node.setPointerCapture(e.pointerId);
			} catch {
				// ignore
			}
		};

		const onMove = (e: PointerEvent) => {
			if (!dragging) return;
			const dx = e.clientX - lastX;
			const dy = e.clientY - lastY;
			lastX = e.clientX;
			lastY = e.clientY;

			// Drag sensitivity tuned for phone/desktop.
			if (!usingMotion || !motionSeen) {
				yaw = normalizeAngle(yaw + dx * 0.005);
				pitch = clamp(pitch + dy * 0.005, -Math.PI / 2, Math.PI / 2);
			}
		};

		const onUp = () => {
			dragging = false;
		};

		node.addEventListener('pointerdown', onDown);
		node.addEventListener('pointermove', onMove);
		node.addEventListener('pointerup', onUp);
		node.addEventListener('pointercancel', onUp);
		node.addEventListener('lostpointercapture', onUp);

		return {
			destroy() {
				node.removeEventListener('pointerdown', onDown);
				node.removeEventListener('pointermove', onMove);
				node.removeEventListener('pointerup', onUp);
				node.removeEventListener('pointercancel', onUp);
				node.removeEventListener('lostpointercapture', onUp);
			}
		};
	}

	function hit() {
		const next = hitCount + 1;
		hitCount = next;
		onChange(next);
		onSubmit?.(next);
		nextTarget();
		spawnTargetNow?.();
	}

	const currentTarget = $derived(targets[targetIndex] ?? null);

	let canvasEl: HTMLCanvasElement | null = $state(null);
	let hudEl: HTMLDivElement | null = $state(null);
	let spawnTargetNow: (() => void) | null = null;

	function bodyScrollLockAction(_: HTMLElement) {
		if (typeof document === 'undefined') return;
		const prev = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return {
			destroy() {
				document.body.style.overflow = prev;
			}
		};
	}

	$effect(() => {
		if (typeof window === 'undefined') return;
		if (!canvasEl) return;

		let disposed = false;
		let raf = 0;
		let cleanup: (() => void) | null = null;

		(async () => {
			const THREE = await import('three');
			if (disposed) return;

			const renderer = new THREE.WebGLRenderer({
				canvas: canvasEl!,
				antialias: true,
				alpha: false
			});
			renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
			renderer.outputColorSpace = THREE.SRGBColorSpace;
			renderer.setClearColor(0x05070f, 1);

			const scene = new THREE.Scene();
			const camera = new THREE.PerspectiveCamera(fovDeg, 1, 0.05, 60);
			camera.rotation.order = 'YXZ';
			camera.position.set(0, 1.2, 0);

			// Lights
			scene.add(new THREE.AmbientLight(0xffffff, 0.55));
			const dir = new THREE.DirectionalLight(0xffffff, 0.9);
			dir.position.set(3, 6, 2);
			scene.add(dir);

			// Sky dome
			const skyGeo = new THREE.SphereGeometry(40, 32, 16);
			skyGeo.scale(-1, 1, 1);
			const skyMat = new THREE.MeshStandardMaterial({
				color: 0x0b1024,
				emissive: 0x05081a,
				emissiveIntensity: 0.9,
				metalness: 0,
				roughness: 1
			});
			const sky = new THREE.Mesh(skyGeo, skyMat);
			scene.add(sky);

			// Ground
			const ground = new THREE.Mesh(
				new THREE.PlaneGeometry(80, 80, 1, 1),
				new THREE.MeshStandardMaterial({ color: 0x0a0f22, metalness: 0, roughness: 1 })
			);
			ground.rotation.x = -Math.PI / 2;
			ground.position.y = 0;
			scene.add(ground);

			// Some simple props for depth
			const propMat = new THREE.MeshStandardMaterial({
				color: 0x1b2a62,
				metalness: 0.1,
				roughness: 0.8
			});
			for (let i = 0; i < 50; i++) {
				const box = new THREE.Mesh(
					new THREE.BoxGeometry(
						0.4 + Math.random() * 1.2,
						0.4 + Math.random() * 2.2,
						0.4 + Math.random() * 1.2
					),
					propMat
				);
				const ang = Math.random() * Math.PI * 2;
				const rad = 4 + Math.random() * 14;
				box.position.set(
					Math.sin(ang) * rad,
					(box.geometry as any).parameters.height / 2,
					Math.cos(ang) * rad
				);
				box.rotation.y = Math.random() * Math.PI * 2;
				scene.add(box);
			}

			// Target
			const texLoader = new THREE.TextureLoader();
			const targetGeo = new THREE.SphereGeometry(targetSize, 28, 20);
			let targetMat = new THREE.MeshStandardMaterial({
				color: 0x6366f1,
				emissive: 0x3b3df0,
				emissiveIntensity: 0.35,
				metalness: 0.2,
				roughness: 0.4
			});
			const targetMesh = new THREE.Mesh(targetGeo, targetMat);
			targetMesh.name = 'vrwhack-target';
			scene.add(targetMesh);

			const raycaster = new THREE.Raycaster();
			const ndc = new THREE.Vector2();

			const setSize = () => {
				const parent = canvasEl!.parentElement;
				const w = parent ? parent.clientWidth : window.innerWidth;
				const h = parent ? parent.clientHeight : window.innerHeight;
				renderer.setSize(w, h, false);
				camera.aspect = w / Math.max(1, h);
				camera.fov = fovDeg;
				camera.updateProjectionMatrix();
			};

			const ro = new ResizeObserver(() => setSize());
			if (canvasEl!.parentElement) ro.observe(canvasEl!.parentElement);
			setSize();

			const randomizeTargetPose = () => {
				// Spawn around the current look direction (feels more like "whack-a-mole" in a VR space)
				// while still requiring players to move their phone.
				const yawSpan = Math.PI * 0.9; // ~162° total
				const pitchSpan = Math.PI / 6; // ~30° total
				const tyaw = normalizeAngle(yaw + (Math.random() * 2 - 1) * (yawSpan / 2));
				const tpitch = clamp(
					pitch + (Math.random() * 2 - 1) * (pitchSpan / 2),
					-Math.PI / 3,
					Math.PI / 3
				);
				const r = targetRadius;
				const x = Math.sin(tyaw) * Math.cos(tpitch) * r;
				const z = Math.cos(tyaw) * Math.cos(tpitch) * r;
				const y = 1.2 + Math.sin(tpitch) * r;
				targetMesh.position.set(x, y, z);
			};

			let lastTextureSrc: string | null = null;
			const updateTargetTexture = () => {
				const src = typeof currentTarget?.src === 'string' ? currentTarget.src : '';
				if (!src.trim()) {
					lastTextureSrc = null;
					targetMat.map = null;
					targetMat.color.setHex(0x6366f1);
					targetMat.needsUpdate = true;
					return;
				}
				if (src === lastTextureSrc) return;
				lastTextureSrc = src;
				texLoader.load(
					src,
					(tex: any) => {
						if (disposed) return;
						tex.colorSpace = THREE.SRGBColorSpace;
						tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy?.() ?? 1);
						targetMat.map = tex;
						targetMat.color.setHex(0xffffff);
						targetMat.needsUpdate = true;
					},
					undefined,
					() => {
						// ignore load error; fall back to color
					}
				);
			};

			spawnTargetNow = () => {
				randomizeTargetPose();
				updateTargetTexture();
			};

			const tryHit = (clientX: number, clientY: number, e?: Event) => {
				const rect = canvasEl!.getBoundingClientRect();
				const x = (clientX - rect.left) / Math.max(1, rect.width);
				const y = (clientY - rect.top) / Math.max(1, rect.height);
				ndc.set(x * 2 - 1, -(y * 2 - 1));
				camera.updateMatrixWorld(true);
				raycaster.setFromCamera(ndc, camera);
				const hits = raycaster.intersectObject(targetMesh, true);
				if (hits.length) {
					e?.preventDefault?.();
					hit();
					return true;
				}
				return false;
			};

			const onPointerDown = (e: PointerEvent) => {
				// pointerdown is the primary path (mobile + desktop)
				tryHit(e.clientX, e.clientY, e);
			};

			const onTouchStart = (e: TouchEvent) => {
				// Fallback for browsers without pointer events
				const t = e.touches && e.touches[0];
				if (!t) return;
				tryHit(t.clientX, t.clientY, e);
			};

			const onClick = (e: MouseEvent) => {
				// Fallback if pointer events are quirky
				tryHit(e.clientX, e.clientY, e);
			};

			canvasEl!.addEventListener('pointerdown', onPointerDown, { passive: false });
			canvasEl!.addEventListener('touchstart', onTouchStart, { passive: false });
			canvasEl!.addEventListener('click', onClick, { passive: true });

			// Initial placement
			randomizeTargetPose();
			updateTargetTexture();

			// Motion smoothing (render-loop driven)
			const smoothQ = new THREE.Quaternion();
			const targetQ = new THREE.Quaternion();
			let smoothInit = false;
			let lastFrameAt = performance?.now ? performance.now() : Date.now();
			const SMOOTH_TAU_S = 0.08;

			let lastSeed = targetSeed;
			const tick = () => {
				if (disposed) return;
				const now = performance?.now ? performance.now() : Date.now();
				const dt = Math.min(0.05, Math.max(0, (now - lastFrameAt) / 1000));
				lastFrameAt = now;
				const alpha = dt ? 1 - Math.exp(-dt / SMOOTH_TAU_S) : 1;

				// Apply camera from motion quaternion (preferred) or fallback yaw/pitch.
				if (usingMotion && motionSeen && motionTargetQuat) {
					targetQ.set(
						motionTargetQuat.x,
						motionTargetQuat.y,
						motionTargetQuat.z,
						motionTargetQuat.w
					);
					if (!smoothInit) {
						smoothQ.copy(targetQ);
						smoothInit = true;
					} else {
						smoothQ.slerp(targetQ, alpha);
					}
					camera.quaternion.copy(smoothQ);
					motionQuat = {
						x: smoothQ.x,
						y: smoothQ.y,
						z: smoothQ.z,
						w: smoothQ.w
					};
					camera.updateMatrixWorld();
				} else {
					camera.rotation.y = yaw;
					camera.rotation.x = pitch;
					camera.updateMatrixWorld();
				}

				// Reposition/retint target when game spawns next
				if (targetSeed !== lastSeed) {
					lastSeed = targetSeed;
					randomizeTargetPose();
					updateTargetTexture();
				}

				renderer.render(scene, camera);
				raf = window.requestAnimationFrame(tick);
			};
			raf = window.requestAnimationFrame(tick);

			cleanup = () => {
				try {
					spawnTargetNow = null;
					canvasEl?.removeEventListener('pointerdown', onPointerDown as any);
					canvasEl?.removeEventListener('touchstart', onTouchStart as any);
					canvasEl?.removeEventListener('click', onClick as any);
					ro.disconnect();
					renderer.dispose();
					targetGeo.dispose();
					skyGeo.dispose();
					(ground.geometry as any).dispose?.();
					(ground.material as any).dispose?.();
					(targetMat as any).dispose?.();
					(skyMat as any).dispose?.();
					(propMat as any).dispose?.();
				} catch {
					// ignore
				}
			};
		})();

		return () => {
			disposed = true;
			if (raf) window.cancelAnimationFrame(raf);
			cleanup?.();
		};
	});
</script>

<div class="fixed inset-0 z-50 bg-black" use:bodyScrollLockAction>
	<div class="absolute inset-0" use:lookDragAction style="touch-action: none">
		<canvas class="h-full w-full" bind:this={canvasEl}></canvas>
	</div>

	<div
		class="pointer-events-none absolute top-0 right-0 left-0 flex items-start justify-between gap-3 p-4"
		bind:this={hudEl}
	>
		<div class="pointer-events-auto rounded-2xl bg-black/50 px-4 py-3 backdrop-blur">
			<div class="text-sm font-semibold text-slate-100">Point & Shoot</div>
			<div class="mt-1 text-xs text-slate-300">{hint}</div>
			<div class="mt-2 text-xs text-slate-200">
				Score: <span class="font-semibold text-white">{hitCount}</span>
			</div>
			<div class="mt-2 flex items-center gap-2">
				<button
					type="button"
					class="pointer-events-auto rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-white/15"
					onclick={enableMotion}
				>
					Enable motion
				</button>
				<div class="text-xs text-slate-300">
					{#if usingMotion}
						{#if motionSeen}
							Motion active
						{:else if motionError}
							{motionError}
						{:else}
							Waiting for sensor…
						{/if}
					{:else if motionDenied}
						Motion denied (drag to look)
					{:else}
						Drag to look
					{/if}
				</div>
			</div>
			{#if usingMotion && motionSeen}
				<div class="mt-2 text-[0.7rem] text-slate-400">
					Updated {Math.max(0, Math.round((Date.now() - lastMotionAt) / 1000))}s ago
				</div>
			{/if}
		</div>

		<div class="pointer-events-none rounded-2xl bg-black/40 px-4 py-3 text-right backdrop-blur">
			<div class="text-xs text-slate-300">Tap the target sphere</div>
			<div class="text-xs text-slate-400">Each hit = +1</div>
		</div>
	</div>
</div>
