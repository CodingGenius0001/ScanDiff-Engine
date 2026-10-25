import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {Chip, Mark, Rise, Strike, Wordmark} from '../components/Brand';
import {BrowserFrame} from '../components/BrowserFrame';
import {DeviceFrame} from '../components/DeviceFrame';
import {cuts} from '../components/Focus';
import {DentUnderLight, PhotoCard} from '../components/Graphics';
import {DemoBadge} from '../components/Overlays';
import {C, EASE_IN_OUT, FONT, MONO, clamp} from '../theme';
import {Plate, Shot, useScene} from './kit';

/** L01: every handoff, one question; photos are weak evidence. */
export const Hook: React.FC<{base: number; end: number}> = ({base, end}) => {
	const {frame, c, w} = useScene(base);
	const photosIn = c('L01', 3);
	const dentIn = c('L01', 4);
	const pairIn = c('L01', 5);
	const guessIn = c('L01', 6);
	const len = end - base;
	return (
		<AbsoluteFill style={{background: C.paper}}>
			<Plate />
			{/* "Every time an item changes hands, whether it's a sale, a return, a rental" */}
			<Shot name="Handoff types" from={0} to={c('L01', 2) - 4} fadeIn={0}>
				<AbsoluteFill style={{justifyContent: 'center', paddingLeft: 160, paddingBottom: 80}}>
					<Rise delay={4} size={104}>Every time an item</Rise>
					<Rise delay={10} size={104}>changes hands.</Rise>
					<div style={{display: 'flex', gap: 18, marginTop: 48}}>
						<Chip delay={w('L01', 'marketplace')}>marketplace sale</Chip>
						<Chip delay={w('L01', 'return')}>return</Chip>
						<Chip delay={w('L01', 'rental')}>rental</Chip>
					</div>
				</AbsoluteFill>
			</Shot>
			{/* "what condition was it in?" */}
			<Shot name="The question" from={c('L01', 2) - 4} to={photosIn - 2}>
				<AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', paddingBottom: 60}}>
					<Rise delay={6} size={132} style={{textAlign: 'center'}}>
						What <span style={{color: C.stamp}}>condition</span>
						<br />
						was it in?
					</Rise>
				</AbsoluteFill>
			</Shot>
			{/* "Usually, all we have are a few photos." */}
			<Shot name="A few photos" from={photosIn - 2} to={dentIn}>
				<AbsoluteFill>
					<PhotoCard src="stills/photo_12.jpg" w={420} h={560} delay={2} rotate={-7} style={{left: 430, top: 180}} />
					<PhotoCard src="stills/photo_50.jpg" w={420} h={560} delay={7} rotate={5} style={{left: 1050, top: 170}} />
					<PhotoCard src="stills/photo_36.jpg" w={420} h={560} delay={12} rotate={-1} style={{left: 740, top: 210}} />
				</AbsoluteFill>
			</Shot>
			{/* "A tiny 3 mm dent can disappear under the wrong lighting." */}
			<Shot name="Dent under light" from={dentIn} to={pairIn}>
				<DentShot lightAt={w('L01', 'disappear') - dentIn} />
			</Shot>
			{/* "And comparing photos taken at different times? That's mostly guesswork." */}
			<Shot name="Two photos" from={pairIn} to={len} fadeOut={10}>
				<AbsoluteFill>
					<PhotoCard src="stills/photo_36.jpg" w={400} h={520} delay={0} rotate={-4} label="before" style={{left: 480, top: 170}} />
					<PhotoCard src="stills/photo_12.jpg" w={400} h={520} delay={5} rotate={4} label="after" style={{left: 1010, top: 170}} exposure={1.25} />
					<AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', paddingBottom: 140}}>
						<div
							style={{
								fontFamily: FONT,
								fontWeight: 300,
								fontSize: 160,
								color: C.stamp,
								opacity: interpolate(frame - pairIn, [12, 22], [0, 1], clamp),
								textShadow: '0 10px 40px rgba(0,0,0,0.8)',
							}}
						>
							?
						</div>
					</AbsoluteFill>
					<AbsoluteFill
						style={{
							background: `rgba(11,11,11,${interpolate(frame, [guessIn, guessIn + 10], [0, 0.8], clamp)})`,
							justifyContent: 'center',
							alignItems: 'center',
							paddingBottom: 80,
						}}
					>
						<Rise delay={guessIn - pairIn} size={120}>
							Mostly <span style={{color: C.inkSoft}}>guesswork.</span>
						</Rise>
					</AbsoluteFill>
				</AbsoluteFill>
			</Shot>
		</AbsoluteFill>
	);
};

const DentShot: React.FC<{lightAt: number}> = ({lightAt}) => {
	const frame = useCurrentFrame();
	const light = interpolate(frame, [lightAt - 6, lightAt + 24], [0, 1], {...clamp, easing: EASE_IN_OUT});
	return (
		<AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', paddingBottom: 120}}>
			<div style={{position: 'relative'}}>
				<DentUnderLight light={light} w={1000} h={560} />
				<div
					style={{
						position: 'absolute',
						left: 500 + 110,
						top: 280 - 120,
						display: 'flex',
						alignItems: 'center',
						gap: 14,
						opacity: interpolate(frame, [6, 14], [0, 1], clamp) * (1 - light * 0.9),
					}}
				>
					<span style={{width: 70, height: 2, background: C.paper}} />
					<span style={{fontFamily: MONO, fontSize: 34, color: C.paper}}>3 mm dent</span>
				</div>
				<div style={{position: 'absolute', left: 0, right: 0, top: -64, textAlign: 'center', fontFamily: MONO, fontSize: 24, color: C.inkSoft}}>
					{light < 0.5 ? 'light from the side' : 'light from the front'}
				</div>
			</div>
		</AbsoluteFill>
	);
};

/** L02: "that's where ScanDiff comes in." The mark's two circles settle into one. */
export const LogoReveal: React.FC<{base: number; end: number}> = ({base}) => {
	const {w} = useScene(base);
	const t = w('L02', 'scandiff') - 6;
	return (
		<AbsoluteFill style={{background: C.paper, justifyContent: 'center', alignItems: 'center', paddingBottom: 90}}>
			<div style={{display: 'flex', alignItems: 'center', gap: 34}}>
				<Mark size={190} delay={t} />
				<Wordmark size={170} delay={t + 8} />
			</div>
		</AbsoluteFill>
	);
};

/** L03: "We're turning 'just trust me' into real, measurable evidence." */
export const TrustMe: React.FC<{base: number; end: number}> = ({base}) => {
	const {w} = useScene(base);
	return (
		<AbsoluteFill style={{background: C.paper, justifyContent: 'center', alignItems: 'center', paddingBottom: 110}}>
			<Rise delay={2} size={120} color={C.inkSoft}>
				<Strike at={w('L03', 'into') - 2}>“just trust me”</Strike>
			</Rise>
			<Rise delay={w('L03', 'real') - 2} size={120} style={{marginTop: 26}}>
				<span style={{color: C.ink}}>→ </span>
				<span style={{color: C.stamp}}>measurable</span> evidence.
			</Rise>
		</AbsoluteFill>
	);
};

/** L04: what ScanDiff does: compares 3D scans, with a checkout built in. */
export const Product: React.FC<{base: number; end: number}> = ({base, end}) => {
	const {frame, c, w} = useScene(base);
	const checkout = c('L04', 2);
	const len = end - base;
	const phoneIn = interpolate(frame, [0, 20], [0, 1], {...clamp, easing: EASE_IN_OUT});
	return (
		<AbsoluteFill style={{background: C.paper}}>
			<Plate />
			<div style={{opacity: phoneIn, translate: `${(1 - phoneIn) * -60}px 0`}}>
				<DeviceFrame
					height={820}
					src="clips/scr_results.mp4"
					trimBefore={63}
					focus={[[0, {x: 0.5, y: 0.5, zoom: 1}]]}
					style={{left: 210, top: 70}}
				/>
			</div>
			<Shot name="Comparison" from={6} to={checkout + 6} fadeOut={8}>
				<BrowserFrame
					src="web/05-comparison-heat-map.png"
					url="/item/mug-001"
					width={1060}
					height={680}
					style={{left: 690, top: 120}}
					focus={cuts([[0, {x: 0.33, y: 0.28, zoom: 1.0}], [w('L04', 'detect') - 6, {x: 0.36, y: 0.24, zoom: 1.4}]], checkout + 6)}
				/>
			</Shot>
			<Shot name="Checkout" from={checkout} to={len} fadeIn={8}>
				<BrowserFrame
					src="web/08-checkout-payment-held.png"
					url="/checkout/mug-001"
					width={1060}
					height={680}
					style={{left: 690, top: 120}}
					focus={cuts([[0, {x: 0.5, y: 0.3, zoom: 1.05}]], len - checkout)}
				/>
				<DemoBadge duration={len - checkout} />
			</Shot>
		</AbsoluteFill>
	);
};

/** L05: "Let's start with a simple example: a mug." */
export const Example: React.FC<{base: number; end: number}> = ({base, end}) => {
	const len = end - base;
	return (
		<AbsoluteFill style={{background: C.paper}}>
			<Plate />
			<BrowserFrame
				src="web/07-checkout-test-card.png"
				url="/checkout/mug-001"
				width={1400}
				height={760}
				style={{left: 260, top: 110}}
				focus={cuts([[0, {x: 0.5, y: 0.3, zoom: 1.1}], [40, {x: 0.42, y: 0.17, zoom: 1.6}]], len)}
			/>
			<DemoBadge duration={len} />
		</AbsoluteFill>
	);
};
