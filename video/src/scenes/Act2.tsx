import React from 'react';
import {AbsoluteFill, interpolate, Sequence, useCurrentFrame} from 'remotion';
import {Chip, Rise} from '../components/Brand';
import {BrowserFrame, webPoint} from '../components/BrowserFrame';
import {DeviceFrame} from '../components/DeviceFrame';
import {cuts} from '../components/Focus';
import {HashGraphic} from '../components/Graphics';
import {DemoBadge, Highlight, LowerThird} from '../components/Overlays';
import {C, clamp} from '../theme';
import {BRoll, Plate, Shot, useScene} from './kit';

// Phone on the right, words on the left; the step label owns the top-left corner.
export const PHONE = {height: 810, style: {left: 1250, top: 96}};
export const WEB = {left: 210, top: 170, width: 1500, height: 740};

/** Left-hand label next to the phone. */
export const SideLabel: React.FC<{kicker: string; title: React.ReactNode; delay?: number; children?: React.ReactNode}> = ({kicker, title, delay = 0, children}) => (
	<div style={{position: 'absolute', left: 170, top: 330, width: 980}}>
		<Rise delay={delay} size={30} color={C.stamp} weight={400} style={{letterSpacing: 0}}>
			{kicker}
		</Rise>
		<Rise delay={delay + 4} size={92} style={{marginTop: 14}}>
			{title}
		</Rise>
		{children}
	</div>
);

/** L06: the seller lists the item; an item ID and two QR codes. */
export const ListItem: React.FC<{base: number; end: number}> = ({base, end}) => {
	const {c, w} = useScene(base);
	const len = end - base;
	const caseFile = Math.round(2.6 * 30);
	const qr = c('L06', 1) - 4;
	return (
		<AbsoluteFill style={{background: C.paper}}>
			<Shot name="Typing the listing" from={0} to={caseFile} fadeIn={0}>
				<BRoll src="clips/cam6525_list.mp4" srcW={1080} srcH={1920} trimBefore={0.8} focus={[[0, {x: 0.5, y: 0.52, zoom: 1.0}], [caseFile, {x: 0.5, y: 0.5, zoom: 1.1}]]} />
			</Shot>
			<Shot name="Case file" from={caseFile} to={qr}>
				<Plate />
				<DeviceFrame
					{...PHONE}
					kind="image"
					src="app/11-case-file-waiting.png"
					focus={cuts([[0, {x: 0.5, y: 0.5, zoom: 1}], [36, {x: 0.42, y: 0.2, zoom: 1.55}]], qr - caseFile)}
				/>
				<SideLabel kicker="Unique item ID" title="belkincharger-003" delay={6} />
			</Shot>
			<Shot name="Two QR codes" from={qr} to={len}>
				<Plate />
				<DeviceFrame {...PHONE} kind="image" src="app/12-baseline-qr.png" focus={cuts([[0, {x: 0.5, y: 0.4, zoom: 1.05}]], len - qr)} />
				<SideLabel kicker="Generated with the listing" title="Two QR codes">
					<div style={{display: 'flex', flexDirection: 'column', gap: 20, marginTop: 44, alignItems: 'flex-start'}}>
						<Chip delay={w('L06', 'original') - qr} size={30}>
							baseline · seller scans before packing
						</Chip>
						<Chip delay={w('L06', 'buyer') - qr} size={30} accent>
							check-in · buyer scans on arrival
						</Chip>
					</div>
				</SideLabel>
			</Shot>
			<Sequence from={caseFile} durationInFrames={len - caseFile} layout="none">
				<LowerThird n="01" label="List an item" note="Capture shown on a wireless charger" duration={len - caseFile} />
			</Sequence>
		</AbsoluteFill>
	);
};

/** L07: before shipping, the seller scans it with the iPhone's LiDAR. */
export const SellerScan: React.FC<{base: number; end: number}> = ({base, end}) => {
	const {w} = useScene(base);
	const len = end - base;
	const phone = w('L07', 'using') - 4;
	return (
		<AbsoluteFill style={{background: C.paper}}>
			<Shot name="Orbiting the item" from={0} to={phone + 4} fadeIn={0}>
				<BRoll src="clips/cam6526_orbit.mp4" srcW={1440} srcH={2560} trimBefore={22} focus={[[0, {x: 0.5, y: 0.5, zoom: 1}], [phone, {x: 0.5, y: 0.5, zoom: 1.06}]]} />
			</Shot>
			<Shot name="LiDAR capture" from={phone} to={len}>
				<Plate />
				<DeviceFrame {...PHONE} src="clips/scr_capture.mp4" trimBefore={11} />
				<SideLabel kicker="LiDAR · iPhone" title="Seller baseline" delay={4} />
			</Shot>
			<LowerThird n="02" label="Seller baseline scan" duration={len} />
		</AbsoluteFill>
	);
};

/** L08: guided capture, textured model, photos with poses, SHA-256 on every file. */
export const Capture: React.FC<{base: number; end: number}> = ({base, end}) => {
	const {c} = useScene(base);
	const len = end - base;
	const model = c('L08', 1) - 3;
	const photos = c('L08', 2) - 3;
	const saved = c('L08', 3) - 3;
	const hash = saved + 54;
	const tamper = c('L08', 4);
	const recon = 40;
	return (
		<AbsoluteFill style={{background: C.paper}}>
			<Plate />
			<Shot name="Checklist" from={0} to={30} fadeIn={0} fadeOut={0}>
				<DeviceFrame {...PHONE} kind="image" src="app/04-before-you-scan.png" focus={[[0, {x: 0.5, y: 0.3, zoom: 1.35}]]} />
			</Shot>
			<Shot name="Guided orbit" from={30} to={model} fadeIn={0} fadeOut={4}>
				<DeviceFrame {...PHONE} src="clips/scr_capture.mp4" trimBefore={59} playbackRate={1.5} />
			</Shot>
			<Shot name="Reconstruction, sped up" from={model} to={model + recon} fadeIn={4} fadeOut={0}>
				<DeviceFrame {...PHONE} src="clips/scr_recon_tl.mp4" trimBefore={0} playbackRate={90 / recon} focus={[[0, {x: 0.32, y: 0.5, zoom: 1.6}]]} />
			</Shot>
			<Shot name="Textured model" from={model + recon} to={photos} fadeIn={0} fadeOut={4}>
				<DeviceFrame {...PHONE} src="clips/scr_results.mp4" trimBefore={63} focus={[[0, {x: 0.5, y: 0.5, zoom: 1.05}]]} />
			</Shot>
			<Shot name="Photos with poses" from={photos} to={saved} fadeIn={4} fadeOut={4}>
				<DeviceFrame {...PHONE} src="clips/scr_capture.mp4" trimBefore={125} playbackRate={2} />
			</Shot>
			<Shot name="Saved with SHA-256" from={saved} to={hash + 4} fadeIn={4} fadeOut={6}>
				<DeviceFrame
					{...PHONE}
					kind="image"
					src="app/10-saved-sha256.png"
					focus={cuts([[0, {x: 0.5, y: 0.3, zoom: 1.0}], [24, {x: 0.5, y: 0.27, zoom: 1.3}]], hash + 4 - saved)}
					rings={[{at: 24, dur: hash - saved - 20, x: 0.03, y: 0.302, w: 0.94, h: 0.032}]}
				/>
			</Shot>
			<Shot name="Labels" from={0} to={hash} fadeIn={0}>
				<Sequence from={0} durationInFrames={model} layout="none">
					<SideLabel kicker="The app guides" title="Guided capture" delay={4} />
				</Sequence>
				<Sequence from={model} durationInFrames={photos - model} layout="none">
					<SideLabel kicker="Built on the phone" title="Textured 3D model" />
				</Sequence>
				<Sequence from={photos} durationInFrames={saved - photos} layout="none">
					<SideLabel kicker="Key photos" title="With camera positions" />
				</Sequence>
				<Sequence from={saved} durationInFrames={hash - saved} layout="none">
					<SideLabel kicker="Before upload" title="SHA-256 on every file" />
				</Sequence>
			</Shot>
			<Shot name="Fingerprints" from={hash} to={len} fadeOut={8}>
				<HashScene tamperAt={tamper - hash} />
			</Shot>
			<LowerThird n="02" label="Seller baseline scan" duration={hash} />
		</AbsoluteFill>
	);
};

const HashScene: React.FC<{tamperAt: number}> = ({tamperAt}) => {
	const frame = useCurrentFrame();
	const t = interpolate(frame, [0, Math.max(30, tamperAt)], [0, 1], clamp);
	const tamper = interpolate(frame, [tamperAt + 18, tamperAt + 30], [0, 1], clamp);
	return (
		<AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', paddingBottom: 110}}>
			<div style={{scale: 1.3}}>
				<HashGraphic t={t} tamper={tamper} />
			</div>
		</AbsoluteFill>
	);
};

/** L09: demo Visa checkout; the money is held until the arrival scan. */
export const Checkout: React.FC<{base: number; end: number}> = ({base, end}) => {
	const {frame, c} = useScene(base);
	const len = end - base;
	const held = c('L09', 1) - 2;
	const heldFocus = cuts([[0, {x: 0.5, y: 0.3, zoom: 1.0}], [c('L09', 2) - held, {x: 0.6, y: 0.3, zoom: 1.45}]], len - held);
	const pill = webPoint(1846, 744, WEB.width, WEB.height, frame - held, heldFocus);
	const pill2 = webPoint(2134, 790, WEB.width, WEB.height, frame - held, heldFocus);
	return (
		<AbsoluteFill style={{background: C.paper}}>
			<Plate />
			<Shot name="Test card" from={0} to={held + 6} fadeIn={0} fadeOut={8}>
				<BrowserFrame
					src="web/07-checkout-test-card.png"
					url="/checkout/mug-001"
					width={WEB.width}
					height={WEB.height}
					style={{left: WEB.left, top: WEB.top}}
					focus={cuts([[0, {x: 0.45, y: 0.55, zoom: 1.0}], [45, {x: 0.33, y: 0.74, zoom: 1.6}]], held + 6)}
				/>
			</Shot>
			<Shot name="Payment held" from={held} to={len}>
				<BrowserFrame src="web/08-checkout-payment-held.png" url="/checkout/mug-001" width={WEB.width} height={WEB.height} style={{left: WEB.left, top: WEB.top}} focus={heldFocus} />
				<Sequence from={c('L09', 2) - held} durationInFrames={len - c('L09', 2)} layout="none">
					<div style={{position: 'absolute', left: WEB.left, top: WEB.top}}>
						<Highlight x={pill.x} y={pill.y} w={pill2.x - pill.x} h={pill2.y - pill.y} radius={30} duration={len - c('L09', 2)} />
					</div>
				</Sequence>
			</Shot>
			<DemoBadge duration={len} />
			<LowerThird n="03" label="Pay and hold" duration={len} />
		</AbsoluteFill>
	);
};
