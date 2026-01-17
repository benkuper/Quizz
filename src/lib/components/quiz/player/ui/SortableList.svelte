<script lang="ts">
	import { flip } from 'svelte/animate';
	import { cubicOut } from 'svelte/easing';

	type Props = {
		items: string[];
		value: string[];
		disabled?: boolean;
		onChange: (next: string[]) => void;
	};

	let { items, value, disabled = false, onChange }: Props = $props();

	let order: string[] = $state([]);
	let draggingId: string | null = $state(null);
	let dragOffsetY = $state(0);
	let dragItemHeight = $state(0);
	let lastPointerY = $state<number | null>(null);
	let rafPending = false;

	let itemEls: Record<string, HTMLLIElement> = {};

	function register(node: HTMLLIElement, id: string) {
		itemEls[id] = node;
		return {
			destroy() {
				delete itemEls[id];
			}
		};
	}

	function sameOrder(a: string[], b: string[]) {
		if (a === b) return true;
		if (a.length !== b.length) return false;
		for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
		return true;
	}

	$effect(() => {
		// Don't fight the user's pointer while actively dragging.
		if (draggingId) return;
		const base = Array.isArray(value) && value.length ? value : items;
		if (sameOrder(order, base)) return;
		order = [...base];
	});

	function move(from: number, to: number) {
		if (from === to) return;
		const next = [...order];
		const [it] = next.splice(from, 1);
		next.splice(to, 0, it);
		order = next;
		onChange(next);
	}

	function onPointerDown(e: PointerEvent, id: string) {
		if (disabled) return;
		if (e.button !== 0) return;
		e.preventDefault();
		const el = itemEls[id];
		if (el) {
			const r = el.getBoundingClientRect();
			dragOffsetY = e.clientY - r.top;
			dragItemHeight = r.height;
		} else {
			dragOffsetY = 0;
			dragItemHeight = 0;
		}
		try {
			(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		} catch {
			// ignore
		}
		draggingId = id;
	}

	function processMove(pointerY: number) {
		if (disabled) return;
		if (!draggingId) return;
		const from = order.indexOf(draggingId);
		if (from < 0) return;
		const centerY = dragItemHeight ? pointerY - dragOffsetY + dragItemHeight / 2 : pointerY;

		// Only swap with neighbors when we cross their midpoint.
		const prevId = from > 0 ? order[from - 1] : null;
		if (prevId) {
			const prevEl = itemEls[prevId];
			if (prevEl) {
				const r = prevEl.getBoundingClientRect();
				const mid = r.top + r.height / 2;
				if (centerY < mid) {
					move(from, from - 1);
					return;
				}
			}
		}

		const nextId = from < order.length - 1 ? order[from + 1] : null;
		if (nextId) {
			const nextEl = itemEls[nextId];
			if (nextEl) {
				const r = nextEl.getBoundingClientRect();
				const mid = r.top + r.height / 2;
				if (centerY > mid) {
					move(from, from + 1);
					return;
				}
			}
		}
	}

	function onPointerMove(e: PointerEvent) {
		if (!draggingId) return;
		// Keep scroll from fighting the gesture when the handle is used.
		e.preventDefault();
		lastPointerY = e.clientY;
		if (rafPending) return;
		rafPending = true;
		requestAnimationFrame(() => {
			rafPending = false;
			if (lastPointerY === null) return;
			processMove(lastPointerY);
		});
	}

	function onPointerUp() {
		draggingId = null;
		lastPointerY = null;
		dragOffsetY = 0;
		dragItemHeight = 0;
	}
</script>

<ul
	class="space-y-2 select-none"
	onpointermove={onPointerMove}
	onpointerup={onPointerUp}
	onpointercancel={onPointerUp}
>
	{#each order as id, idx (id)}
		<li
			use:register={id}
			animate:flip={{ duration: draggingId === id ? 0 : draggingId ? 70 : 180, easing: cubicOut }}
			style="will-change: transform"
			class="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 transition-shadow duration-150 ease-out"
			class:ring-2={draggingId === id}
			class:ring-indigo-400={draggingId === id}
			class:shadow-lg={draggingId === id}
		>
			<div class="flex min-w-0 items-center gap-3">
				<button
					type="button"
					class="shrink-0 cursor-grab touch-none rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-base text-slate-200 transition-transform duration-100 ease-out select-none active:scale-[0.98] disabled:opacity-50"
					{disabled}
					aria-label="Drag to reorder"
					onpointerdown={(e) => onPointerDown(e, id)}
				>
					≡
				</button>
				<div class="truncate text-base font-semibold">{id}</div>
			</div>

			<!-- <div class="flex shrink-0 items-center gap-2">
				<button
					type="button"
					class="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 active:scale-[0.99] disabled:opacity-50"
					disabled={disabled || idx === 0}
					onclick={() => move(idx, idx - 1)}
					aria-label="Move up"
				>
					↑
				</button>
				<button
					type="button"
					class="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 active:scale-[0.99] disabled:opacity-50"
					disabled={disabled || idx === order.length - 1}
					onclick={() => move(idx, idx + 1)}
					aria-label="Move down"
				>
					↓
				</button>
			</div> -->
		</li>
	{/each}
</ul>
