import {Video} from '@remotion/media';
import React from 'react';
import {Img, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {Highlight, Tap} from './Overlays';
import {C, FONT} from '../theme';
import {focusAt, FocusKeys, placeSource} from './Focus';

// The iPhone screen recording: 1320 x 2868.
export const SCREEN_W = 1320;
export const SCREEN_H = 2868;
// Its status bar (time, red recording pill, signal) is the top 4.6% of the frame.
const STATUS_FRACTION = 132 / SCREEN_H;

/** A clean status bar drawn over the recording's own, so the red pill never shows. */
const StatusBar: React.FC<{scale: number}> = ({scale}) => (
	<div
		style={{
			position: 'absolute',
			left: 0,
			right: 0,
			top: 0,
			height: 132 * scale,
			background: '#000',
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'space-between',
			padding: `0 ${118 * scale}px 0 ${150 * scale}px`,
			color: '#fff',
			fontFamily: FONT,
			fontWeight: 600,
			fontSize: 50 * scale,
			boxSizing: 'border-box',
		}}
	>
		<span>9:41</span>
		<span style={{display: 'flex', gap: 14 * scale, alignItems: 'center'}}>
			{[0.45, 0.65, 0.85, 1].map((h) => (
				<span key={h} style={{width: 9 * scale, height: 34 * h * scale, background: '#fff', borderRadius: 2 * scale, alignSelf: 'flex-end'}} />
			))}
			<span
				style={{
					marginLeft: 16 * scale,
					width: 74 * scale,
					height: 36 * scale,
					borderRadius: 10 * scale,
					border: `${3 * scale}px solid rgba(255,255,255,0.5)`,
					padding: 3 * scale,
					boxSizing: 'border-box',
				}}
			>
				<span style={{display: 'block', width: '86%', height: '100%', background: '#fff', borderRadius: 5 * scale}} />
			</span>
		</span>
	</div>
);

type ScreenProps = {
	/** Clip in public/clips, or an image in public/app. */
	src: string;
	kind?: 'video' | 'image';
	/** Seconds into the clip where this shot starts. */
	trimBefore?: number;
	playbackRate?: number;
	focus?: FocusKeys;
	/** Hide the clean status bar (for shots that have none, like the timelapse). */
	noStatusBar?: boolean;
};

type Props = ScreenProps & {
	/** Overall height of the phone in px. */
	height: number;
	/** Touch ripples: frame, and the point on the recording as 0-1 fractions. */
	taps?: {at: number; x: number; y: number}[];
	/** Orange rings around a region of the recording (0-1 fractions), from `at` for `dur` frames. */
	rings?: {at: number; dur: number; x: number; y: number; w: number; h: number}[];
	style?: React.CSSProperties;
	children?: React.ReactNode;
};

/** A titanium-black iPhone with the screen recording inside, cropped and zoomed with `focus`. */
export const DeviceFrame: React.FC<Props> = ({height, style, children, taps = [], rings = [], ...screen}) => {
	const frame = useCurrentFrame();
	const bezel = height * 0.017;
	const screenH = height - bezel * 2;
	const screenW = (screenH * SCREEN_W) / SCREEN_H;
	const width = screenW + bezel * 2;
	const radius = width * 0.165;
	return (
		<div
			style={{
				position: 'absolute',
				width,
				height,
				borderRadius: radius,
				background: 'linear-gradient(145deg, #3a3a3c 0%, #1b1b1d 35%, #0e0e0f 65%, #2c2c2e 100%)',
				padding: bezel,
				boxSizing: 'border-box',
				boxShadow: '0 40px 120px rgba(0,0,0,0.65), 0 0 0 1.5px #4a4a4c inset, 0 0 0 1px #000',
				...style,
			}}
		>
			<div
				style={{
					position: 'relative',
					width: screenW,
					height: screenH,
					borderRadius: radius - bezel,
					overflow: 'hidden',
					background: '#000',
				}}
			>
				<Screen {...screen} w={screenW} h={screenH} />
				{rings.map((r) => {
					const p = placeSource(SCREEN_W, SCREEN_H, screenW, screenH, focusAt(frame, screen.focus ?? [[0, {x: 0.5, y: 0.5, zoom: 1}]]));
					return (
						<Sequence key={`r${r.at}`} from={r.at} durationInFrames={r.dur} layout="none">
							<Highlight x={p.left + r.x * p.width} y={p.top + r.y * p.height} w={r.w * p.width} h={r.h * p.height} radius={10} duration={r.dur} />
						</Sequence>
					);
				})}
				{taps.map((t) => {
					const p = placeSource(SCREEN_W, SCREEN_H, screenW, screenH, focusAt(frame, screen.focus ?? [[0, {x: 0.5, y: 0.5, zoom: 1}]]));
					return (
						<Sequence key={t.at} from={t.at} durationInFrames={20} layout="none">
							<Tap x={p.left + t.x * p.width} y={p.top + t.y * p.height} />
						</Sequence>
					);
				})}
				{/* Dynamic Island */}
				<div
					style={{
						position: 'absolute',
						top: screenH * 0.0135,
						left: '50%',
						translate: '-50% 0',
						width: screenW * 0.29,
						height: screenH * 0.0175,
						borderRadius: 999,
						background: '#000',
					}}
				/>
				{children}
			</div>
		</div>
	);
};

const Screen: React.FC<ScreenProps & {w: number; h: number}> = ({
	src,
	kind = 'video',
	trimBefore = 0,
	playbackRate = 1,
	focus = [[0, {x: 0.5, y: 0.5, zoom: 1}]],
	noStatusBar,
	w,
	h,
}) => {
	const frame = useCurrentFrame();
	const f = focusAt(frame, focus);
	const p = placeSource(SCREEN_W, SCREEN_H, w, h, f);
	const scale = p.width / SCREEN_W;
	return (
		<div style={{position: 'absolute', left: p.left, top: p.top, width: p.width, height: p.height}}>
			{kind === 'video' ? (
				<Video
					src={staticFile(src)}
					trimBefore={Math.round(trimBefore * 30)}
					playbackRate={playbackRate}
					muted
					style={{width: '100%', height: '100%'}}
					objectFit="fill"
				/>
			) : (
				<Img src={staticFile(src)} style={{width: '100%', height: '100%'}} />
			)}
			{noStatusBar ? null : <StatusBar scale={scale} />}
		</div>
	);
};

/** The status-bar height of the recording, as a fraction, for callers placing overlays. */
export const STATUS_BAR = STATUS_FRACTION;
export const deviceWidth = (height: number) => {
	const bezel = height * 0.017;
	return ((height - bezel * 2) * SCREEN_W) / SCREEN_H + bezel * 2;
};
export const DEVICE_BG = C.paper;
