import {Video} from '@remotion/media';
import React from 'react';
import {AbsoluteFill, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {focusAt, FocusKeys, placeSource} from '../components/Focus';
import {cue, word} from '../timeline';
import {C, clamp} from '../theme';

/** Frame helpers relative to the scene's own start (`base`, absolute). */
export const useScene = (base: number) => {
	const frame = useCurrentFrame();
	return {
		frame,
		c: (id: string, i: number) => cue(id, i) - base,
		w: (id: string, text: string, afterS = 0) => word(id, text, afterS) - base,
	};
};

/** Fades its children in over `fadeIn` frames and out over the last `fadeOut`. */
export const Fade: React.FC<{children: React.ReactNode; fadeIn?: number; fadeOut?: number; style?: React.CSSProperties}> = ({
	children,
	fadeIn = 8,
	fadeOut = 8,
	style,
}) => {
	const frame = useCurrentFrame();
	const {durationInFrames} = useVideoConfig();
	const o = Math.min(
		fadeIn ? interpolate(frame, [0, fadeIn], [0, 1], clamp) : 1,
		fadeOut ? interpolate(frame, [durationInFrames - fadeOut, durationInFrames], [1, 0], clamp) : 1,
	);
	return <AbsoluteFill style={{opacity: o, ...style}}>{children}</AbsoluteFill>;
};

/** A shot: a Sequence with a fade on both ends. */
export const Shot: React.FC<{
	from: number;
	to: number;
	name: string;
	children: React.ReactNode;
	fadeIn?: number;
	fadeOut?: number;
}> = ({from, to, name, children, fadeIn, fadeOut}) => (
	<Sequence name={name} from={from} durationInFrames={Math.max(1, to - from)} layout="none">
		<Fade fadeIn={fadeIn} fadeOut={fadeOut}>
			{children}
		</Fade>
	</Sequence>
);

/**
 * Camera b-roll. Landscape sources fill the frame (cropped around `focus`, slow push).
 * Vertical phone footage is shown whole, as a rounded 9:16 card on the studio
 * backdrop, instead of being cropped into a tight, shaky close-up.
 */
export const BRoll: React.FC<{src: string; srcW: number; srcH: number; trimBefore: number; focus: FocusKeys; playbackRate?: number}> = ({
	src,
	srcW,
	srcH,
	trimBefore,
	focus,
	playbackRate = 1,
}) => {
	const frame = useCurrentFrame();
	const {width, height} = useVideoConfig();
	const portrait = srcH > srcW;
	const vw = portrait ? Math.round((800 * 9) / 16) : width;
	const vh = portrait ? 800 : height;
	const f = focusAt(frame, focus);
	const p = placeSource(srcW, srcH, vw, vh, portrait ? {...f, x: 0.5, y: 0.5} : f);
	const video = (
		<div style={{position: 'absolute', ...p}}>
			<Video src={staticFile(src)} trimBefore={Math.round(trimBefore * 30)} playbackRate={playbackRate} muted objectFit="fill" style={{width: '100%', height: '100%'}} />
		</div>
	);
	if (portrait) {
		return (
			<AbsoluteFill>
				<Plate />
				<div
					style={{
						position: 'absolute',
						left: (width - vw) / 2,
						top: 70,
						width: vw,
						height: vh,
						borderRadius: 28,
						overflow: 'hidden',
						boxShadow: `0 40px 120px rgba(0,0,0,0.7), 0 0 0 1px ${C.rule}`,
					}}
				>
					{video}
				</div>
			</AbsoluteFill>
		);
	}
	return (
		<AbsoluteFill style={{background: C.paper, overflow: 'hidden'}}>
			{video}
			{/* soft vignette keeps captions and lower-thirds readable */}
			<AbsoluteFill style={{background: 'radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)'}} />
			<AbsoluteFill style={{background: 'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 70%, rgba(0,0,0,0.5) 100%)'}} />
		</AbsoluteFill>
	);
};

/** The studio backdrop of the site's 3D plates: a soft key light from above on black. */
export const Plate: React.FC = () => (
	<AbsoluteFill style={{background: `radial-gradient(ellipse 70% 60% at 50% 28%, #242424 0%, #121212 55%, ${C.paper} 100%)`}} />
);
