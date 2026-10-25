import React from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {LINES, at} from '../timeline';
import {C, EASE_OUT, FONT, MONO, SAFE_X, clamp} from '../theme';

/** Step label, bottom left: orange number, a hairline, the step name. */
export const LowerThird: React.FC<{n: string; label: string; duration: number; note?: string}> = ({n, label, duration, note}) => {
	const frame = useCurrentFrame();
	const inP = interpolate(frame, [0, 18], [0, 1], {...clamp, easing: EASE_OUT});
	const out = interpolate(frame, [duration - 12, duration], [1, 0], clamp);
	return (
		<div
			style={{
				position: 'absolute',
				left: SAFE_X,
				top: 92,
				display: 'flex',
				flexDirection: 'column',
				gap: 12,
				opacity: inP * out,
				translate: `${(1 - inP) * -24}px 0`,
			}}
		>
			<div style={{display: 'flex', alignItems: 'center', gap: 18}}>
				<span style={{fontFamily: MONO, fontSize: 26, color: C.stamp, letterSpacing: 1}}>{n}</span>
				<span style={{width: 56 * inP, height: 1.5, background: C.rule}} />
				<span style={{fontFamily: FONT, fontSize: 34, fontWeight: 400, color: C.ink, letterSpacing: -0.4}}>{label}</span>
			</div>
			{note ? <span style={{fontFamily: FONT, fontSize: 22, color: C.inkFaint, marginLeft: 2}}>{note}</span> : null}
		</div>
	);
};

/** The site's own wording, pinned top right while any payment is on screen. */
export const DemoBadge: React.FC<{duration: number}> = ({duration}) => {
	const frame = useCurrentFrame();
	const o = interpolate(frame, [0, 10, duration - 10, duration], [0, 1, 1, 0], clamp);
	return (
		<div
			style={{
				position: 'absolute',
				right: SAFE_X,
				top: 30,
				opacity: o,
				display: 'flex',
				alignItems: 'center',
				gap: 12,
				padding: '10px 20px',
				borderRadius: 999,
				border: `1.5px solid ${C.stamp}`,
				background: 'rgba(11,11,11,0.86)',
				color: C.stamp,
				fontFamily: FONT,
				fontSize: 24,
				fontWeight: 500,
			}}
		>
			<span style={{width: 9, height: 9, borderRadius: 99, background: C.stamp, boxShadow: `0 0 10px ${C.stamp}`}} />
			Demo only, no real payment.
		</div>
	);
};

/**
 * Burned-in captions for every VO line: the active card, at most two lines,
 * centered at the bottom on a soft scrim. Timed from the VO word timestamps.
 */
export const Captions: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	for (const l of LINES) {
		const s = at(l.id);
		if (frame < s || frame > s + (l.duration + 0.3) * fps) continue;
		const t = (frame - s) / fps;
		const card = l.cards.find((c, i) => t >= c.start && (t < c.end || i === l.cards.length - 1));
		if (!card) return null;
		const cs = s + Math.round(card.start * fps);
		const ce = s + Math.round(Math.min(card.end + 0.25, l.duration + 0.3) * fps);
		const o = interpolate(frame, [cs, cs + 4, ce - 4, ce], [0, 1, 1, 0], clamp);
		return (
			<div style={{position: 'absolute', left: 0, right: 0, bottom: 64, display: 'flex', justifyContent: 'center', opacity: o}}>
				<div
					style={{
						maxWidth: 1180,
						padding: '12px 28px 14px',
						borderRadius: 12,
						background: 'rgba(8,8,8,0.72)',
						color: '#f4f4f2',
						fontFamily: FONT,
						fontWeight: 400,
						fontSize: 44,
						lineHeight: 1.22,
						letterSpacing: -0.2,
						textAlign: 'center',
						textWrap: 'balance',
					}}
				>
					{card.text}
				</div>
			</div>
		);
	}
	return null;
};

/** An orange ring that draws itself around a UI element, then lets go. */
export const Highlight: React.FC<{x: number; y: number; w: number; h: number; duration: number; radius?: number}> = ({
	x,
	y,
	w,
	h,
	duration,
	radius = 12,
}) => {
	const frame = useCurrentFrame();
	const p = interpolate(frame, [0, 14], [0, 1], {...clamp, easing: EASE_OUT});
	const o = interpolate(frame, [duration - 10, duration], [1, 0], clamp);
	const pad = 10 * (1 - p) + 6;
	return (
		<div
			style={{
				position: 'absolute',
				left: x - pad,
				top: y - pad,
				width: w + pad * 2,
				height: h + pad * 2,
				borderRadius: radius + pad / 2,
				border: `3px solid ${C.stamp}`,
				boxShadow: `0 0 24px rgba(255,106,26,0.45)`,
				opacity: p * o,
			}}
		/>
	);
};

/** A touch ripple for screen recordings. */
export const Tap: React.FC<{x: number; y: number}> = ({x, y}) => {
	const frame = useCurrentFrame();
	const r = interpolate(frame, [0, 16], [10, 54], {...clamp, easing: EASE_OUT});
	const o = interpolate(frame, [0, 3, 16], [0, 0.9, 0], clamp);
	return (
		<>
			<div style={{position: 'absolute', left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: 999, border: `3px solid ${C.stamp}`, opacity: o}} />
			<div style={{position: 'absolute', left: x - 14, top: y - 14, width: 28, height: 28, borderRadius: 999, background: 'rgba(255,255,255,0.75)', opacity: interpolate(frame, [0, 2, 10], [0, 0.9, 0], clamp)}} />
		</>
	);
};
