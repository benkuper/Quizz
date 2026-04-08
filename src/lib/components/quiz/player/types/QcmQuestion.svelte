<script lang="ts">
	import { base } from '$app/paths';
	import type { QuizOptionAnswer, QuizQuestionQcm } from '$lib/quiz/types';
	import { resolveAppAssetUrl } from '$lib/utils/paths.svelte';

	function appPath(path: string) {
		const normalized = path.startsWith('/') ? path : `/${path}`;
		return typeof window === 'undefined'
			? `${base || '.'}${normalized}`
			: resolveAppAssetUrl(normalized);
	}

	const OPTION_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
	const PHONE_BUTTON_LAYOUT = [
		{
			label: 'A',
			selectedSrc: appPath('/phone_bt_A.png'),
			left: '5.75%',
			top: '44.1%',
			width: '41.8%',
			height: '9.7%',
			fallbackClass: 'phone-button-fallback-a'
		},
		{
			label: 'B',
			selectedSrc: appPath('/phone_bt_B.png'),
			left: '52.2%',
			top: '44.1%',
			width: '41.8%',
			height: '9.7%',
			fallbackClass: 'phone-button-fallback-b'
		},
		{
			label: 'C',
			selectedSrc: appPath('/phone_bt_C.png'),
			left: '5.75%',
			top: '56.2%',
			width: '41.8%',
			height: '9.7%',
			fallbackClass: 'phone-button-fallback-c'
		},
		{
			label: 'D',
			selectedSrc: appPath('/phone_bt_D.png'),
			left: '52.2%',
			top: '56.2%',
			width: '41.8%',
			height: '9.7%',
			fallbackClass: 'phone-button-fallback-d'
		}
	] as const;

	type Props = {
		question: QuizQuestionQcm;
		value: QuizOptionAnswer | QuizOptionAnswer[] | null;
		onChange: (next: QuizOptionAnswer | QuizOptionAnswer[] | null) => void;
		embeddedInPhoneShell?: boolean;
	};

	let { question, value, onChange, embeddedInPhoneShell = false }: Props = $props();
	let unavailableSelectedAssets = $state<Record<number, boolean>>({});

	const isMulti = $derived(Boolean(question.multiple));
	const usePhoneLayout = $derived(
		(question.options?.length ?? 0) > 0 && (question.options?.length ?? 0) <= 4
	);
	const phoneOptions = $derived.by(() => {
		return (question.options ?? []).slice(0, PHONE_BUTTON_LAYOUT.length).map((opt, index) => ({
			option: opt,
			index,
			layout: PHONE_BUTTON_LAYOUT[index]
		}));
	});

	function optionLabel(index: number) {
		return OPTION_LABELS[index] ?? String(index + 1);
	}

	function toOptionIndex(raw: QuizOptionAnswer | null | undefined) {
		if (typeof raw === 'number' && Number.isInteger(raw)) {
			return raw >= 1 && raw <= (question.options?.length ?? 0) ? raw : null;
		}

		if (typeof raw !== 'string') return null;

		const trimmed = raw.trim();
		if (!trimmed) return null;

		const numericValue = Number(trimmed);
		if (
			Number.isInteger(numericValue) &&
			numericValue >= 1 &&
			numericValue <= (question.options?.length ?? 0)
		) {
			return numericValue;
		}

		const labelIndex = OPTION_LABELS.indexOf(trimmed.toUpperCase());
		if (trimmed.length === 1 && labelIndex >= 0 && labelIndex < (question.options?.length ?? 0)) {
			return labelIndex + 1;
		}

		const optionIndex = question.options?.findIndex((option) => option === trimmed) ?? -1;
		return optionIndex >= 0 ? optionIndex + 1 : null;
	}

	const selectedSingle = $derived(
		!isMulti ? toOptionIndex(Array.isArray(value) ? null : value) : null
	);
	const selectedMulti = $derived.by(() => {
		if (!isMulti || !Array.isArray(value)) return [] as number[];

		const selected = value
			.map((entry) => toOptionIndex(entry))
			.filter((entry): entry is number => entry !== null);

		return [...new Set(selected)];
	});

	function toggle(index: number) {
		if (isMulti) {
			const cur = selectedMulti;
			if (cur.includes(index)) onChange(cur.filter((value) => value !== index));
			else onChange([...cur, index]);
			return;
		}
		onChange(index);
	}

	function isSelected(index: number) {
		return isMulti ? selectedMulti.includes(index + 1) : selectedSingle === index + 1;
	}

	function markSelectedAssetUnavailable(index: number) {
		unavailableSelectedAssets = {
			...unavailableSelectedAssets,
			[index]: true
		};
	}
</script>

{#if usePhoneLayout}
	<div
		class={embeddedInPhoneShell
			? 'absolute inset-0'
			: 'relative mx-auto aspect-[434/776] w-full overflow-hidden rounded-[2.25rem] shadow-[0_1.5rem_3rem_rgba(0,0,0,0.45)]'}
	>
		{#if !embeddedInPhoneShell}
			<img
				src={appPath('/phone_bg.png')}
				alt=""
				class="pointer-events-none absolute inset-0 h-full w-full object-cover select-none"
				draggable="false"
			/>
		{/if}

		{#each phoneOptions as { option, index, layout } (index)}
			<button
				type="button"
				class="absolute overflow-hidden rounded-[1.75rem] outline-none active:scale-[0.99]"
				class:ring-4={isSelected(index)}
				class:ring-white={isSelected(index)}
				style:left={layout.left}
				style:top={layout.top}
				style:width={layout.width}
				style:height={layout.height}
				aria-label={option}
				aria-pressed={isSelected(index)}
				title={option}
				onclick={() => toggle(index + 1)}
			>
				{#if isSelected(index)}
					{#if unavailableSelectedAssets[index]}
						<span class={`absolute inset-0 ${layout.fallbackClass}`}></span>
					{:else}
						<img
							src={layout.selectedSrc}
							alt=""
							class="pointer-events-none absolute inset-0 h-full w-full object-fill select-none"
							draggable="false"
							onerror={() => markSelectedAssetUnavailable(index)}
						/>
					{/if}
				{/if}

				<span
					class="pointer-events-none absolute inset-0 flex items-center justify-center text-[clamp(1.4rem,4.8vw,2.6rem)] font-black tracking-[0.24em] text-white [text-shadow:0_0.14em_0.45em_rgba(0,0,0,0.75)]"
				>
					{layout.label}
				</span>
			</button>
		{/each}
	</div>
{:else}
	<div class="grid gap-2">
		{#each question.options ?? [] as opt, index}
			<button
				type="button"
				class="rounded-2xl border border-slate-800 bg-slate-900 px-4 py-4 text-center text-3xl font-black tracking-[0.2em] active:scale-[0.99]"
				class:ring-2={(!isMulti && selectedSingle === index + 1) ||
					(isMulti && selectedMulti.includes(index + 1))}
				class:ring-indigo-400={(!isMulti && selectedSingle === index + 1) ||
					(isMulti && selectedMulti.includes(index + 1))}
				aria-label={opt}
				title={opt}
				onclick={() => toggle(index + 1)}
			>
				<div class="flex items-center justify-center gap-3">
					<span>{optionLabel(index)}</span>
					{#if isMulti}
						<span class="text-sm text-slate-300"
							>{selectedMulti.includes(index + 1) ? '✓' : ''}</span
						>
					{:else}
						<span class="text-sm text-slate-300">{selectedSingle === index + 1 ? '✓' : ''}</span>
					{/if}
				</div>
			</button>
		{/each}
	</div>
{/if}

<style>
	.phone-button-fallback-a,
	.phone-button-fallback-b,
	.phone-button-fallback-c,
	.phone-button-fallback-d {
		border-radius: 1.75rem;
		box-shadow:
			inset 0 0.14rem 0.5rem rgba(255, 255, 255, 0.35),
			inset 0 -0.18rem 0.7rem rgba(0, 0, 0, 0.25),
			0 0 1rem rgba(255, 255, 255, 0.12);
	}

	.phone-button-fallback-a {
		background: linear-gradient(180deg, #ff6b5f 0%, #d11a1a 55%, #8c0707 100%);
	}

	.phone-button-fallback-b {
		background: linear-gradient(180deg, #baf77a 0%, #51b12e 55%, #23620d 100%);
	}

	.phone-button-fallback-c {
		background: linear-gradient(180deg, #6bc6ff 0%, #1c69d3 55%, #0b3978 100%);
	}

	.phone-button-fallback-d {
		background: linear-gradient(180deg, #ffd37a 0%, #ff8e1a 55%, #bd5400 100%);
	}
</style>
