import React from 'react';
import {Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import diff from '../data/diff_response.json';
import {C, EASE_IN_OUT, EASE_OUT, FONT, MONO, clamp} from '../theme';

/** A condition photo, as a slightly rotated print. */
export const PhotoCard: React.FC<{
	src: string;
	w: number;
	h: number;
	delay?: number;
	rotate?: number;
	label?: string;
	style?: React.CSSProperties;
	exposure?: number;
}> = ({src, w, h, delay = 0, rotate = 0, label, style, exposure = 1}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const s = spring({frame: frame - delay, fps, config: {damping: 18, stiffness: 120}});
	return (
		<div
			style={{
				position: 'absolute',
				width: w,
				height: h + (label ? 58 : 0),
				padding: 14,
				paddingBottom: label ? 58 : 14,
				background: '#f2f1ee',
				borderRadius: 6,
				boxShadow: '0 30px 80px rgba(0,0,0,0.55)',
				rotate: `${rotate * s}deg`,
				opacity: interpolate(s, [0, 0.3], [0, 1], clamp),
				translate: `0 ${(1 - s) * -120}px`,
				boxSizing: 'content-box',
				...style,
			}}
		>
			<Img src={staticFile(src)} style={{width: w, height: h, objectFit: 'cover', filter: `brightness(${exposure}) contrast(${1 / Math.max(0.6, exposure * 0.9)})`}} />
			{label ? (
				<div style={{position: 'absolute', left: 18, bottom: 16, fontFamily: MONO, fontSize: 24, color: '#333'}}>{label}</div>
			) : null}
		</div>
	);
};

/**
 * A 3 mm dent lit from a raking angle, then from the front: the shading that
 * shows the dent depends on the light angle, so head-on light flattens it away.
 * `light` 0 = raking light (dent visible), 1 = flat light (dent gone).
 */
export const DentUnderLight: React.FC<{light: number; w: number; h: number}> = ({light, w, h}) => {
	const vis = 1 - light;
	const ang = interpolate(light, [0, 1], [-35, 0]);
	return (
		<div
			style={{
				position: 'relative',
				width: w,
				height: h,
				borderRadius: 28,
				overflow: 'hidden',
				background: `linear-gradient(${110 + ang}deg, #e9e7e2 0%, #d9d6cf ${55 + light * 30}%, #c9c5bc 100%)`,
				boxShadow: '0 30px 80px rgba(0,0,0,0.55)',
			}}
		>
			{/* the dent: shadow on the lit side's far wall, highlight on the near wall */}
			<div
				style={{
					position: 'absolute',
					left: w * 0.5 - 70,
					top: h * 0.5 - 50,
					width: 140,
					height: 100,
					borderRadius: '50%',
					// Concave: with light from the upper left, the near (upper-left) wall falls
					// in shadow and the far (lower-right) wall catches the light.
					background: `radial-gradient(ellipse at ${32 + 18 * light}% ${34 + 16 * light}%, rgba(60,55,48,${0.6 * vis}) 0%, rgba(60,55,48,0) 52%), radial-gradient(ellipse at ${70 - 20 * light}% ${68 - 18 * light}%, rgba(255,255,255,${0.8 * vis}) 0%, rgba(255,255,255,0) 42%)`,
					boxShadow: `inset 6px 6px 14px rgba(60,55,48,${0.35 * vis}), inset -4px -4px 10px rgba(255,255,255,${0.5 * vis})`,
				}}
			/>
			{/* the light itself, sweeping from the side to straight on */}
			<div
				style={{
					position: 'absolute',
					inset: 0,
					background: `radial-gradient(circle at ${interpolate(light, [0, 1], [-10, 50])}% ${interpolate(light, [0, 1], [20, 45])}%, rgba(255,255,255,${0.15 + light * 0.5}) 0%, rgba(255,255,255,0) 60%)`,
				}}
			/>
		</div>
	);
};

// ---------- Alignment: global registration, then ICP ----------

// A mug-like point cloud: a cylinder wall plus a handle, 360 points, deterministic.
const CLOUD = (() => {
	const pts: [number, number, number][] = [];
	let seed = 7;
	const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
	for (let i = 0; i < 300; i++) {
		const a = rnd() * Math.PI * 2;
		pts.push([Math.cos(a) * 1, rnd() * 2.2 - 1.1, Math.sin(a) * 1]);
	}
	for (let i = 0; i < 60; i++) {
		const a = rnd() * Math.PI - Math.PI / 2;
		pts.push([1.05 + Math.cos(a) * 0.55, Math.sin(a) * 0.62, (rnd() - 0.5) * 0.18]);
	}
	return pts;
})();

const project = (p: [number, number, number], yaw: number, pitch: number, dx: number, dy: number, s: number) => {
	const [x, y, z] = p;
	const x1 = x * Math.cos(yaw) + z * Math.sin(yaw);
	const z1 = -x * Math.sin(yaw) + z * Math.cos(yaw);
	const y1 = y * Math.cos(pitch) - z1 * Math.sin(pitch);
	const z2 = y * Math.sin(pitch) + z1 * Math.cos(pitch);
	return {x: x1 * s + dx, y: y1 * s + dy, z: z2};
};

/**
 * Two scans of the same item: gray baseline, orange check-in. `t` 0-0.45 is the
 * global registration (one coarse jump), 0.45-1 the ICP iterations closing the gap.
 */
export const AlignGraphic: React.FC<{t: number; size: number; rmseLabel: boolean}> = ({t, size, rmseLabel}) => {
	const spin = t * 0.6;
	const coarse = interpolate(t, [0.18, 0.32], [0, 1], {...clamp, easing: EASE_IN_OUT});
	// ICP: geometric steps, like the real iterations (each one halves the residual).
	const icpT = interpolate(t, [0.45, 0.95], [0, 1], clamp);
	const steps = Math.floor(icpT * 6);
	const icp = 1 - Math.pow(0.5, steps + (icpT * 6 - steps) * 0.999);
	const err = (1 - coarse) * 1 + coarse * 0.22 * (1 - icp);
	const yawOff = 1.1 * err;
	const shift = 0.9 * err;
	const s = size * 0.27;
	const cx = size / 2;
	const cy = size / 2;
	return (
		<svg width={size} height={size} style={{overflow: 'visible'}}>
			{CLOUD.map((p, i) => {
				const a = project(p, 0.5 + spin, 0.35, cx, cy, s);
				return <circle key={`a${i}`} cx={a.x} cy={a.y} r={3.2} fill={C.unchanged} opacity={0.55 + a.z * 0.2} />;
			})}
			{CLOUD.map((p, i) => {
				const b = project(p, 0.5 + spin + yawOff, 0.35 + err * 0.4, cx + shift * s * 1.2, cy - shift * s * 0.5, s);
				return <circle key={`b${i}`} cx={b.x} cy={b.y} r={3.2} fill={C.stamp} opacity={0.7 + b.z * 0.2} />;
			})}
			{rmseLabel ? (
				<text x={cx} y={size + 10} textAnchor="middle" fontFamily={MONO} fontSize={24} fill={C.inkSoft}>
					{`ICP RMSE ${diff.stats.icp_rmse_mm.toFixed(2)} mm`}
				</text>
			) : null}
		</svg>
	);
};

// ---------- Measurement: the real histogram from contract/diff_response.json ----------

export const Histogram: React.FC<{w: number; h: number; grow: number; showNoise: number; showThreshold: number}> = ({
	w,
	h,
	grow,
	showNoise,
	showThreshold,
}) => {
	const counts = diff.histogram.counts;
	const edges = diff.histogram.bin_edges_mm;
	const maxMm = edges[edges.length - 1];
	const noise = diff.stats.noise_floor_mm;
	const thr = diff.stats.threshold_mm;
	const max = Math.sqrt(Math.max(...counts));
	const pad = {l: 20, b: 64, t: 110};
	const pw = w - pad.l * 2;
	const ph = h - pad.b - pad.t;
	const x = (mm: number) => pad.l + (mm / maxMm) * pw;
	const bw = pw / counts.length;
	return (
		<svg width={w} height={h} style={{overflow: 'visible'}}>
			{/* noise band: the scan's own measured noise */}
			<rect x={x(0)} y={pad.t} width={(x(noise) - x(0)) * showNoise} height={ph} fill="rgba(162,162,158,0.16)" />
			{counts.map((c, i) => {
				const bh = (Math.sqrt(c) / max) * ph * interpolate(grow, [i / counts.length / 2, i / counts.length / 2 + 0.5], [0, 1], clamp);
				const above = edges[i] >= thr;
				return (
					<rect
						key={i}
						x={pad.l + i * bw + 3}
						y={pad.t + ph - bh}
						width={bw - 6}
						height={bh}
						rx={2}
						fill={above ? (showThreshold > 0.5 ? C.added : C.unchanged) : C.unchanged}
						opacity={above ? 1 : 0.85}
					/>
				);
			})}
			<line x1={pad.l} x2={pad.l + pw} y1={pad.t + ph} y2={pad.t + ph} stroke={C.rule} strokeWidth={2} />
			{[0, 3, 5, 10, 15].map((mm) => (
				<text key={mm} x={x(mm)} y={pad.t + ph + 34} textAnchor="middle" fontFamily={MONO} fontSize={22} fill={C.inkFaint}>
					{mm}
				</text>
			))}
			<text x={pad.l + pw} y={pad.t + ph + 34} dx={34} fontFamily={MONO} fontSize={22} fill={C.inkFaint}>
				mm
			</text>
			{/* threshold */}
			<g opacity={showThreshold}>
				<line x1={x(thr)} x2={x(thr)} y1={pad.t - 30} y2={pad.t + ph} stroke={C.stamp} strokeWidth={3} strokeDasharray="8 6" />
				<text x={x(thr) + 14} y={pad.t - 22} fontFamily={MONO} fontSize={26} fill={C.stamp}>{`threshold ${thr.toFixed(1)} mm`}</text>
			</g>
			<g opacity={showNoise}>
				<line x1={x(noise)} x2={x(noise)} y1={pad.t - 64} y2={pad.t + ph} stroke={C.inkSoft} strokeWidth={2} strokeDasharray="3 5" />
				<text x={x(noise) + 14} y={pad.t - 62} fontFamily={MONO} fontSize={26} fill={C.inkSoft}>{`scan's own noise floor ${noise.toFixed(1)} mm`}</text>
			</g>
		</svg>
	);
};

// ---------- Fingerprints ----------

const HEX = '0123456789abcdef';
const scramble = (seed: number, n: number) => {
	let s = seed * 9301 + 49297;
	let out = '';
	for (let i = 0; i < n; i++) {
		s = (s * 9301 + 49297) % 233280;
		out += HEX[Math.floor((s / 233280) * 16)];
	}
	return out;
};

/**
 * Files of one upload (engine/UPLOAD_FORMAT.md) flowing into SHA-256, then the
 * app's ledger row (real values from the recording: version 1, c746fcb620b0...).
 * `tamper` > 0: one byte of model.usdz changes, the hash no longer matches and
 * the engine rejects the upload, as it does for any model_sha256 mismatch.
 */
export const HashGraphic: React.FC<{t: number; tamper: number}> = ({t, tamper}) => {
	const frame = useCurrentFrame();
	const files = ['model.usdz', 'photo_01.jpg', 'photo_02.jpg', 'photo_03.jpg', 'metadata.json'];
	const real = 'c746fcb620b0';
	const resolve = interpolate(t, [0.35, 0.7], [0, 1], clamp);
	const shown = real
		.split('')
		.map((ch, i) => (i / real.length < resolve ? ch : scramble(frame + i, 1)))
		.join('');
	const tamperHash = scramble(Math.floor(frame / 2) + 17, real.length);
	return (
		<div style={{display: 'flex', alignItems: 'center', gap: 70, fontFamily: MONO}}>
			<div style={{display: 'flex', flexDirection: 'column', gap: 14}}>
				{files.map((f, i) => {
					const p = interpolate(t, [i * 0.05, i * 0.05 + 0.2], [0, 1], {...clamp, easing: EASE_OUT});
					const isModel = i === 0;
					return (
						<div
							key={f}
							style={{
								padding: '12px 20px',
								borderRadius: 8,
								border: `1.5px solid ${isModel && tamper > 0 ? C.added : C.rule}`,
								background: C.panel,
								color: isModel && tamper > 0 ? C.added : C.ink,
								fontSize: 26,
								opacity: p,
								translate: `${(1 - p) * -30}px 0`,
							}}
						>
							{f}
							{isModel && tamper > 0 ? <span style={{color: C.added}}>{'  · 1 byte edited'}</span> : null}
						</div>
					);
				})}
			</div>
			<div style={{fontSize: 44, color: C.inkFaint, opacity: interpolate(t, [0.2, 0.3], [0, 1], clamp)}}>→</div>
			<div
				style={{
					width: 640,
					padding: '30px 36px',
					borderRadius: 12,
					border: `1.5px solid ${tamper > 0 ? C.added : C.rule}`,
					background: C.panel,
					opacity: interpolate(t, [0.25, 0.4], [0, 1], clamp),
				}}
			>
				<div style={{fontFamily: FONT, fontSize: 26, color: C.inkSoft, marginBottom: 18}}>Saved · belkincharger-003</div>
				<Row k="Version" v="1" />
				<Row k="SHA-256" v={tamper > 0 ? `${tamperHash}…` : `${shown}…`} accent={tamper > 0 ? C.added : C.stamp} />
				<div
					style={{
						marginTop: 22,
						fontFamily: FONT,
						fontSize: 26,
						color: tamper > 0 ? C.added : C.inkSoft,
						opacity: tamper > 0 ? tamper : interpolate(t, [0.7, 0.85], [0, 1], clamp),
					}}
				>
					{tamper > 0 ? '✕  Fingerprint mismatch: the engine rejects the upload' : 'Every file fingerprinted before upload'}
				</div>
			</div>
		</div>
	);
};

const Row: React.FC<{k: string; v: string; accent?: string}> = ({k, v, accent}) => (
	<div style={{display: 'flex', alignItems: 'baseline', gap: 16, fontSize: 30, margin: '8px 0'}}>
		<span style={{fontFamily: FONT, color: C.inkSoft, width: 150}}>{k}</span>
		<span style={{flex: 1, borderBottom: `2px dotted ${C.rule}`, translate: '0 -8px'}} />
		<span style={{color: accent ?? C.ink, letterSpacing: 1}}>{v}</span>
	</div>
);

// ---------- Classification ----------

const LABELS = [
	['dent_damage', 'dent'],
	['missing_part', 'missing part'],
	['scratch_scuff', 'scuff'],
	['normal_wear', 'normal wear'],
] as const;

/** Before and after crops of one region go to Claude, which returns one of the engine's four labels. */
export const ClassifyGraphic: React.FC<{t: number; settle: number}> = ({t, settle}) => {
	const cardIn = interpolate(t, [0, 0.15], [0, 1], {...clamp, easing: EASE_OUT});
	return (
		<div style={{display: 'flex', alignItems: 'center', gap: 56}}>
			<div style={{display: 'flex', gap: 22, opacity: cardIn, translate: `${(1 - cardIn) * -40}px 0`}}>
				{(['before', 'after'] as const).map((k, i) => (
					<div key={k} style={{display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center'}}>
						<div style={{width: 260, height: 260, borderRadius: 10, overflow: 'hidden', border: `1.5px solid ${C.rule}`, position: 'relative'}}>
							<Img
								src={staticFile('web/05-comparison-heat-map.png')}
								style={{position: 'absolute', width: 2880 * 0.62, left: -(i === 0 ? 560 : 1690) * 0.62 + 130, top: -390 * 0.62 + 130}}
							/>
						</div>
						<span style={{fontFamily: MONO, fontSize: 24, color: C.inkSoft}}>{k}</span>
					</div>
				))}
			</div>
			<div style={{fontSize: 44, color: C.inkFaint, opacity: cardIn}}>→</div>
			<div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
				<div style={{fontFamily: FONT, fontSize: 30, color: C.ink, marginBottom: 6, opacity: interpolate(t, [0.15, 0.25], [0, 1], clamp)}}>
					Claude · vision
				</div>
				{LABELS.map(([code, name], i) => {
					const on = interpolate(t, [0.25 + i * 0.12, 0.3 + i * 0.12], [0, 1], clamp);
					const chosen = i === 0;
					const lit = chosen ? Math.max(on * (1 - settle * 0), settle) : on * (1 - settle * 0.6);
					return (
						<div
							key={code}
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 16,
								padding: '12px 22px',
								borderRadius: 8,
								border: `1.5px solid ${chosen && settle > 0.5 ? C.stamp : C.rule}`,
								background: chosen && settle > 0.5 ? 'rgba(255,106,26,0.1)' : C.panel,
								opacity: interpolate(lit, [0, 1], [0.15, 1]),
								fontFamily: MONO,
								fontSize: 26,
								color: chosen && settle > 0.5 ? C.stamp : C.ink,
								width: 470,
							}}
						>
							<span style={{width: 10, height: 10, borderRadius: 99, background: chosen && settle > 0.5 ? C.stamp : C.inkFaint}} />
							{name}
							<span style={{marginLeft: 'auto', color: C.inkFaint, fontSize: 20}}>{code}</span>
						</div>
					);
				})}
			</div>
		</div>
	);
};
