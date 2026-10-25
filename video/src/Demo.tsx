import {Audio} from '@remotion/media';
import React from 'react';
import {AbsoluteFill, Sequence, staticFile} from 'remotion';
import {Captions} from './components/Overlays';
import {Hook, LogoReveal, Product, TrustMe, Example} from './scenes/Act1';
import {Capture, Checkout, ListItem, SellerScan} from './scenes/Act2';
import {Align, BuyerScan, Classify, Measure, NoData} from './scenes/Act3';
import {Accept, Dispute, Release} from './scenes/Act4';
import {Ahead, Distinction, EndCard, Proof} from './scenes/Act5';
import {C} from './theme';
import {LINES, TOTAL_FRAMES, at, endOf} from './timeline';

type SceneComp = React.FC<{base: number; end: number}>;

// Each scene starts a few frames before its VO line, so the picture leads the voice.
const SCENES: {name: string; comp: SceneComp; from: number}[] = [
	{name: '01 Hook', comp: Hook, from: 0},
	{name: '02 Logo', comp: LogoReveal, from: at('L02') - 6},
	{name: '03 Trust me', comp: TrustMe, from: at('L03') - 4},
	{name: '04 Product', comp: Product, from: at('L04') - 3},
	{name: '05 Example', comp: Example, from: at('L05') - 6},
	{name: '06 List an item', comp: ListItem, from: at('L06') - 3},
	{name: '07 Seller scan', comp: SellerScan, from: at('L07') - 3},
	{name: '08 Capture', comp: Capture, from: at('L08') - 3},
	{name: '09 Checkout', comp: Checkout, from: at('L09') - 4},
	{name: '10 Buyer scan', comp: BuyerScan, from: at('L10') - 6},
	{name: '11 Align', comp: Align, from: at('L11') - 3},
	{name: '12 Measure', comp: Measure, from: at('L12') - 3},
	{name: '13 Classify', comp: Classify, from: at('L13') - 3},
	{name: '14 No data', comp: NoData, from: at('L14') - 3},
	{name: '15 Accept', comp: Accept, from: at('L15') - 6},
	{name: '16 Release', comp: Release, from: at('L16') - 2},
	{name: '17 Dispute', comp: Dispute, from: at('L17') - 3},
	{name: '18 Distinction', comp: Distinction, from: at('L18') - 6},
	{name: '19 Proof', comp: Proof, from: at('L19') - 6},
	{name: '20 Ahead', comp: Ahead, from: at('L20') - 6},
	{name: '21 End', comp: EndCard, from: at('L21') - 4},
];

export const Demo: React.FC = () => {
	return (
		<AbsoluteFill style={{background: C.paper}}>
			{SCENES.map((s, i) => {
				const end = i + 1 < SCENES.length ? SCENES[i + 1].from : TOTAL_FRAMES;
				const Comp = s.comp;
				return (
					<Sequence key={s.name} name={s.name} from={s.from} durationInFrames={end - s.from} premountFor={60}>
						<Comp base={s.from} end={end} />
					</Sequence>
				);
			})}
			<Captions />
			{LINES.map((l) => (
				<Sequence key={l.id} name={`VO ${l.id} · ${l.speaker}`} from={at(l.id)} durationInFrames={endOf(l.id) - at(l.id) + 6} layout="none">
					<Audio src={staticFile(l.src)} />
				</Sequence>
			))}
			{/* Foley: a soft air movement on each scene change, well under the voice. */}
			{SCENES.slice(1, -1).map((s) => (
				<Sequence key={`sfx-${s.name}`} name={`whoosh ${s.name}`} from={Math.max(0, s.from - 10)} durationInFrames={21} layout="none">
					<Audio src={staticFile('sfx/whoosh.wav')} volume={0.12} />
				</Sequence>
			))}
			<Sequence name="end hit" from={SCENES[SCENES.length - 1].from + 2} durationInFrames={48} layout="none">
				<Audio src={staticFile('sfx/hit.wav')} volume={0.3} />
			</Sequence>
		</AbsoluteFill>
	);
};
