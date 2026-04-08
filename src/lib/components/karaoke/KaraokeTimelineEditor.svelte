<script lang="ts">
	type TimelineBlock = {
		id: string;
		startSec: number;
		endSec: number;
		text: string;
	};

	type WaveformEnvelopeSample = {
		min: number;
		max: number;
	};

	type DragState = {
		id: string;
		mode: 'move' | 'resize-start' | 'resize-end';
		originStartSec: number;
		originEndSec: number;
		originPointerTimeSec: number;
	};

	type Props = {
		durationSec: number;
		currentTimeSec: number;
		selectedId: string | null;
		blocks: TimelineBlock[];
		waveformEnvelope?: WaveformEnvelopeSample[];
		waveformLoading?: boolean;
		waveformError?: string;
		zoomPxPerSec?: number;
		minBlockLengthSec?: number;
		onSeek: (timeSec: number) => void;
		onSelect: (id: string) => void;
		onAddBlockAtTime?: (timeSec: number) => void;
		onUpdateBlock: (id: string, startSec: number, endSec: number, mode?: DragState['mode']) => void;
	};

	let {
		durationSec,
		currentTimeSec,
		selectedId,
		blocks,
		waveformEnvelope = [],
		waveformLoading = false,
		waveformError = '',
		zoomPxPerSec = 64,
		minBlockLengthSec = 0.2,
		onSeek,
		onSelect,
		onAddBlockAtTime = () => {},
		onUpdateBlock
	}: Props = $props();

	let viewportEl: HTMLDivElement | null = $state(null);
	let viewportWidth = $state(0);
	let dragState: DragState | null = $state(null);

	const safeDurationSec = $derived(Math.max(durationSec, 1));
	const contentWidthPx = $derived(Math.max(viewportWidth, safeDurationSec * zoomPxPerSec, 960));
	const markerStepSec = $derived(chooseMarkerStep(safeDurationSec, zoomPxPerSec));
	const markers = $derived.by(() => {
		const steps: number[] = [];
		for (let timeSec = 0; timeSec <= safeDurationSec; timeSec += markerStepSec) {
			steps.push(Number(timeSec.toFixed(2)));
		}
		const lastMarker = steps[steps.length - 1] ?? 0;
		if (lastMarker < safeDurationSec) {
			steps.push(Number(safeDurationSec.toFixed(2)));
		}
		return steps;
	});
	const targetBarCount = $derived.by(() =>
		Math.min(3200, Math.max(160, Math.round(contentWidthPx / 2.2)))
	);
	const displayEnvelope = $derived.by(() => {
		const fallback = Array.from({ length: 96 }, () => ({
			min: -0.14,
			max: 0.14
		}));
		const base = waveformEnvelope.length ? waveformEnvelope : fallback;
		return resampleWaveformEnvelope(base, targetBarCount);
	});
	const waveformBarWidthPx = $derived.by(() =>
		Math.max(1, (contentWidthPx / Math.max(1, displayEnvelope.length)) * 0.82)
	);
	const waveformBars = $derived.by(() => {
		const midY = 70;
		const amplitude = 58;
		const spacing = contentWidthPx / Math.max(1, displayEnvelope.length);
		return displayEnvelope.map((sample, index) => {
			const x = spacing * index + spacing / 2;
			let y1 = midY - sample.max * amplitude;
			let y2 = midY - sample.min * amplitude;

			if (Math.abs(y2 - y1) < 1.6) {
				y1 -= 0.8;
				y2 += 0.8;
			}

			return {
				x,
				y1,
				y2
			};
		});
	});
	const playheadLeftPx = $derived(timeToPx(currentTimeSec));

	function chooseMarkerStep(totalSec: number, pixelsPerSecond: number) {
		const targetPx = 90;
		const rawStep = targetPx / Math.max(1, pixelsPerSecond);
		const choices = [0.25, 0.5, 1, 2, 5, 10, 15, 30, 60];
		return choices.find((choice) => choice >= rawStep) ?? Math.max(60, Math.ceil(totalSec / 10));
	}

	function roundTime(value: number) {
		return Math.round(Math.max(0, value) * 100) / 100;
	}

	function clampTime(value: number) {
		return Math.max(0, Math.min(safeDurationSec, value));
	}

	function timeToPx(timeSec: number) {
		return (clampTime(timeSec) / safeDurationSec) * contentWidthPx;
	}

	function pxToTime(pixelOffset: number) {
		return clampTime((pixelOffset / Math.max(1, contentWidthPx)) * safeDurationSec);
	}

	function pointerTime(clientX: number) {
		if (!viewportEl) return 0;
		const rect = viewportEl.getBoundingClientRect();
		return pxToTime(clientX - rect.left + viewportEl.scrollLeft);
	}

	function formatClock(value: number) {
		const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
		const minutes = Math.floor(safe / 60);
		const seconds = safe - minutes * 60;
		return `${String(minutes).padStart(2, '0')}:${seconds.toFixed(2).padStart(5, '0')}`;
	}

	function labelForBlock(block: TimelineBlock) {
		const firstLine = block.text
			.split(/\r?\n|\/+/)
			.map((line) => line.trim())
			.find(Boolean);
		return firstLine || 'Empty block';
	}

	function blockStyle(block: TimelineBlock) {
		const leftPx = timeToPx(block.startSec);
		const widthPx = Math.max(18, timeToPx(block.endSec) - leftPx);
		return `left:${leftPx}px;width:${widthPx}px;`;
	}

	function resampleWaveformEnvelope(samples: WaveformEnvelopeSample[], targetCount: number) {
		if (samples.length <= targetCount) return samples;
		const groupSize = samples.length / targetCount;

		return Array.from({ length: targetCount }, (_, index) => {
			const start = Math.floor(index * groupSize);
			const end = Math.min(samples.length, Math.ceil((index + 1) * groupSize));
			let min = 1;
			let max = -1;

			for (let sampleIndex = start; sampleIndex < end; sampleIndex++) {
				const sample = samples[sampleIndex];
				if (!sample) continue;
				if (sample.min < min) min = sample.min;
				if (sample.max > max) max = sample.max;
			}

			if (min === 1 && max === -1) {
				return {
					min: 0,
					max: 0
				};
			}

			return {
				min,
				max
			};
		});
	}

	function blockClass(block: TimelineBlock) {
		const isSelected = selectedId === block.id;
		return [
			'timeline-block',
			isSelected ? 'is-selected' : '',
			dragState?.id === block.id ? 'is-dragging' : ''
		]
			.filter(Boolean)
			.join(' ');
	}

	function handleBackgroundPointerDown(event: PointerEvent) {
		if ((event.target as HTMLElement).closest('[data-block-control]')) return;
		onSeek(pointerTime(event.clientX));
	}

	function handleBackgroundDoubleClick(event: MouseEvent) {
		if ((event.target as HTMLElement).closest('[data-block-control]')) return;
		onAddBlockAtTime(pointerTime(event.clientX));
	}

	function startDrag(event: PointerEvent, block: TimelineBlock, mode: DragState['mode']) {
		event.stopPropagation();
		event.preventDefault();
		onSelect(block.id);
		dragState = {
			id: block.id,
			mode,
			originStartSec: block.startSec,
			originEndSec: block.endSec,
			originPointerTimeSec: pointerTime(event.clientX)
		};
	}

	function handleBlockActivate(block: TimelineBlock) {
		onSelect(block.id);
		onSeek(block.startSec);
	}

	$effect(() => {
		if (!viewportEl || typeof ResizeObserver === 'undefined') return;

		const observer = new ResizeObserver((entries) => {
			viewportWidth = entries[0]?.contentRect.width ?? 0;
		});

		observer.observe(viewportEl);
		return () => observer.disconnect();
	});

	$effect(() => {
		if (!dragState) return;

		const activeDrag = dragState;
		const handlePointerMove = (event: PointerEvent) => {
			const pointerTimeSec = pointerTime(event.clientX);
			const deltaSec = pointerTimeSec - activeDrag.originPointerTimeSec;
			const originalLength = activeDrag.originEndSec - activeDrag.originStartSec;

			if (activeDrag.mode === 'move') {
				const nextStart = Math.max(
					0,
					Math.min(safeDurationSec - originalLength, activeDrag.originStartSec + deltaSec)
				);
				onUpdateBlock(
					activeDrag.id,
					roundTime(nextStart),
					roundTime(nextStart + originalLength),
					'move'
				);
				return;
			}

			if (activeDrag.mode === 'resize-start') {
				const nextStart = Math.max(
					0,
					Math.min(
						activeDrag.originEndSec - minBlockLengthSec,
						activeDrag.originStartSec + deltaSec
					)
				);
				onUpdateBlock(activeDrag.id, roundTime(nextStart), activeDrag.originEndSec, 'resize-start');
				return;
			}

			const nextEnd = Math.max(
				activeDrag.originStartSec + minBlockLengthSec,
				Math.min(safeDurationSec, activeDrag.originEndSec + deltaSec)
			);
			onUpdateBlock(activeDrag.id, activeDrag.originStartSec, roundTime(nextEnd), 'resize-end');
		};

		const stopDrag = () => {
			dragState = null;
		};

		window.addEventListener('pointermove', handlePointerMove);
		window.addEventListener('pointerup', stopDrag);
		window.addEventListener('pointercancel', stopDrag);

		return () => {
			window.removeEventListener('pointermove', handlePointerMove);
			window.removeEventListener('pointerup', stopDrag);
			window.removeEventListener('pointercancel', stopDrag);
		};
	});
</script>

<div class="timeline-shell">
	<div class="timeline-ruler">
		<div class="timeline-content timeline-content--ruler" style={`width:${contentWidthPx}px;`}>
			{#each markers as marker}
				<div class="timeline-marker" style={`left:${timeToPx(marker)}px;`}>
					<span>{formatClock(marker)}</span>
				</div>
			{/each}
		</div>
	</div>

	<div
		class="timeline-viewport"
		bind:this={viewportEl}
		role="group"
		aria-label="Karaoke waveform timeline"
		onpointerdown={handleBackgroundPointerDown}
		ondblclick={handleBackgroundDoubleClick}
	>
		<div class="timeline-content timeline-content--main" style={`width:${contentWidthPx}px;`}>
			<svg
				class="timeline-waveform"
				viewBox={`0 0 ${contentWidthPx} 140`}
				preserveAspectRatio="none"
				aria-hidden="true"
			>
				<g class="timeline-waveform-bars">
					{#each waveformBars as bar}
						<line
							x1={bar.x}
							y1={bar.y1}
							x2={bar.x}
							y2={bar.y2}
							class="timeline-waveform-bar"
							style={`stroke-width:${waveformBarWidthPx}px;`}
						></line>
					{/each}
				</g>
				<line x1="0" y1="70" x2={contentWidthPx} y2="70" class="timeline-waveform-midline"></line>
			</svg>

			<div class="timeline-grid" aria-hidden="true">
				{#each markers as marker}
					<div class="timeline-grid-line" style={`left:${timeToPx(marker)}px;`}></div>
				{/each}
			</div>

			<div class="timeline-waveform-status">
				{#if waveformLoading}
					<span>Generating waveform...</span>
				{:else if waveformError}
					<span>{waveformError}</span>
				{/if}
			</div>

			<div class="timeline-playhead" style={`left:${playheadLeftPx}px;`}>
				<span>{formatClock(currentTimeSec)}</span>
			</div>

			<div class="timeline-block-layer">
				{#each blocks as block (block.id)}
					<div
						data-block-control
						role="button"
						tabindex="0"
						class={blockClass(block)}
						style={blockStyle(block)}
						onclick={() => handleBlockActivate(block)}
						onkeydown={(event) => {
							if (event.key !== 'Enter' && event.key !== ' ') return;
							event.preventDefault();
							handleBlockActivate(block);
						}}
					>
						<div
							data-block-control
							class="timeline-handle timeline-handle--start"
							onpointerdown={(event) => startDrag(event, block, 'resize-start')}
						></div>
						<div
							data-block-control
							class="timeline-block-body"
							onpointerdown={(event) => startDrag(event, block, 'move')}
						>
							<p class="timeline-block-label">{labelForBlock(block)}</p>
							<p class="timeline-block-time">
								{formatClock(block.startSec)} -> {formatClock(block.endSec)}
							</p>
						</div>
						<div
							data-block-control
							class="timeline-handle timeline-handle--end"
							onpointerdown={(event) => startDrag(event, block, 'resize-end')}
						></div>
					</div>
				{/each}
			</div>
		</div>
	</div>
</div>

<style>
	.timeline-shell {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}

	.timeline-ruler {
		overflow: hidden;
	}

	.timeline-viewport {
		overflow-x: auto;
		overflow-y: hidden;
		border-radius: 0.8rem;
		border: 1px solid rgba(255, 255, 255, 0.08);
		background:
			linear-gradient(180deg, rgba(15, 23, 42, 0.97), rgba(2, 6, 23, 0.99)), rgba(2, 6, 23, 0.98);
	}

	.timeline-content {
		position: relative;
		min-width: 100%;
	}

	.timeline-content--ruler {
		height: 1.35rem;
	}

	.timeline-content--main {
		height: 14.4rem;
	}

	.timeline-marker,
	.timeline-grid-line {
		position: absolute;
		top: 0;
		bottom: 0;
	}

	.timeline-marker {
		width: 0;
		transform: translateX(-0.5px);
		border-left: 1px solid rgba(255, 255, 255, 0.14);
	}

	.timeline-marker span {
		position: absolute;
		top: 0;
		left: 0.25rem;
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		color: rgba(226, 232, 240, 0.72);
		white-space: nowrap;
	}

	.timeline-waveform {
		position: absolute;
		right: 0;
		bottom: 0.6rem;
		left: 0;
		height: 9rem;
		opacity: 0.98;
	}

	.timeline-waveform-bar {
		stroke: rgba(125, 211, 252, 0.92);
		stroke-linecap: round;
		vector-effect: non-scaling-stroke;
	}

	.timeline-waveform-midline {
		stroke: rgba(255, 255, 255, 0.06);
		stroke-width: 1;
		stroke-dasharray: 3 6;
	}

	.timeline-grid {
		position: absolute;
		inset: 0;
	}

	.timeline-grid-line {
		border-left: 1px solid rgba(255, 255, 255, 0.06);
	}

	.timeline-waveform-status {
		position: absolute;
		top: 0.6rem;
		right: 0.65rem;
		z-index: 2;
	}

	.timeline-waveform-status span {
		display: inline-flex;
		align-items: center;
		border-radius: 0.75rem;
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(15, 23, 42, 0.72);
		padding: 0.28rem 0.55rem;
		font-size: 0.72rem;
		font-weight: 700;
		color: rgba(226, 232, 240, 0.86);
	}

	.timeline-playhead {
		position: absolute;
		top: 0.1rem;
		bottom: 0.3rem;
		z-index: 3;
		width: 0;
		transform: translateX(-0.5px);
		border-left: 2px solid rgba(251, 191, 36, 0.95);
		pointer-events: none;
	}

	.timeline-playhead span {
		position: absolute;
		top: -0.05rem;
		left: 0.3rem;
		border-radius: 0.75rem;
		background: rgba(245, 158, 11, 0.2);
		padding: 0.2rem 0.45rem;
		font-size: 0.68rem;
		font-weight: 800;
		color: #fff7bf;
		white-space: nowrap;
	}

	.timeline-block-layer {
		position: absolute;
		top: 2.15rem;
		right: 0;
		left: 0;
		height: 4.1rem;
		z-index: 4;
	}

	.timeline-block {
		position: absolute;
		top: 0;
		display: flex;
		height: 4.1rem;
		align-items: stretch;
		border-radius: 0.68rem;
		border: 1px solid rgba(255, 255, 255, 0.12);
		background:
			linear-gradient(180deg, rgba(251, 191, 36, 0.15), rgba(245, 158, 11, 0.18)),
			rgba(15, 23, 42, 0.9);
		box-shadow: 0 0.6rem 1.5rem rgba(15, 23, 42, 0.24);
		overflow: hidden;
	}

	.timeline-block.is-selected {
		border-color: rgba(253, 230, 138, 0.68);
		box-shadow:
			0 0 0 1px rgba(253, 230, 138, 0.35),
			0 1rem 2rem rgba(251, 191, 36, 0.2);
	}

	.timeline-block.is-dragging {
		cursor: grabbing;
	}

	.timeline-block-body {
		display: flex;
		min-width: 0;
		flex: 1;
		cursor: grab;
		flex-direction: column;
		justify-content: center;
		gap: 0.18rem;
		padding: 0.5rem 0.65rem;
	}

	.timeline-block-label,
	.timeline-block-time {
		margin: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.timeline-block-label {
		font-size: 0.8rem;
		font-weight: 800;
		color: #fff7bf;
	}

	.timeline-block-time {
		font-size: 0.66rem;
		font-weight: 700;
		color: rgba(255, 248, 220, 0.72);
	}

	.timeline-handle {
		width: 0.45rem;
		flex-shrink: 0;
		background: rgba(255, 255, 255, 0.15);
		cursor: ew-resize;
	}

	.timeline-handle--start {
		border-right: 1px solid rgba(255, 255, 255, 0.12);
	}

	.timeline-handle--end {
		border-left: 1px solid rgba(255, 255, 255, 0.12);
	}
</style>
