import React from 'react';
import {Img, staticFile, useCurrentFrame} from 'remotion';
import {C, FONT} from '../theme';
import {focusAt, FocusKeys, placeSource} from './Focus';

// Website captures: 1440 x 900 at 2x.
const WEB_W = 2880;
const WEB_H = 1800;
const BAR = 52;

type Props = {
	src: string;
	url: string;
	width: number;
	height: number;
	focus?: FocusKeys;
	style?: React.CSSProperties;
	children?: React.ReactNode;
};

/** A minimal dark browser window: three dots and the URL, nothing else. */
export const BrowserFrame: React.FC<Props> = ({src, url, width, height, focus, style, children}) => {
	const frame = useCurrentFrame();
	const f = focusAt(frame, focus ?? [[0, {x: 0.5, y: 0.5, zoom: 1}]]);
	const vh = height - BAR;
	const p = placeSource(WEB_W, WEB_H, width, vh, f);
	return (
		<div
			style={{
				position: 'absolute',
				width,
				height,
				borderRadius: 14,
				overflow: 'hidden',
				background: C.panel,
				boxShadow: `0 40px 120px rgba(0,0,0,0.6), 0 0 0 1px ${C.rule}`,
				...style,
			}}
		>
			<div
				style={{
					height: BAR,
					display: 'flex',
					alignItems: 'center',
					padding: '0 20px',
					gap: 9,
					background: '#151515',
					borderBottom: `1px solid ${C.rule}`,
				}}
			>
				{[0, 1, 2].map((i) => (
					<span key={i} style={{width: 13, height: 13, borderRadius: 99, background: '#3a3a39'}} />
				))}
				<div
					style={{
						margin: '0 auto',
						translate: '-30px 0',
						minWidth: 420,
						height: 32,
						borderRadius: 8,
						background: '#0d0d0d',
						border: `1px solid ${C.rule}`,
						color: C.inkSoft,
						fontFamily: FONT,
						fontSize: 17,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						padding: '0 18px',
						letterSpacing: 0.2,
					}}
				>
					<span style={{color: C.inkFaint}}>scandiff.us</span>
					<span style={{color: C.ink}}>{url}</span>
				</div>
			</div>
			<div style={{position: 'relative', width, height: vh, overflow: 'hidden', background: C.paper}}>
				<Img src={staticFile(src)} style={{position: 'absolute', ...p}} />
				{children}
			</div>
		</div>
	);
};

/** Where a point of the capture (in its 2880 x 1800 px) lands inside the viewport. */
export const webPoint = (px: number, py: number, width: number, height: number, frame: number, focus: FocusKeys) => {
	const f = focusAt(frame, focus);
	const p = placeSource(WEB_W, WEB_H, width, height - BAR, f);
	return {x: p.left + (px / WEB_W) * p.width, y: BAR + p.top + (py / WEB_H) * p.height};
};
