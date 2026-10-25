import React from "react";
import { Composition, Still } from "remotion";
import { Demo } from "./Demo";
import { Thumbnail } from "./Thumbnail";
import { TOTAL_FRAMES } from "./timeline";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="ScanDiffDemo"
        component={Demo}
        durationInFrames={TOTAL_FRAMES}
        fps={30}
        width={1920}
        height={1080}
      />
      <Still id="Thumbnail" component={Thumbnail} width={1280} height={720} />
    </>
  );
};
