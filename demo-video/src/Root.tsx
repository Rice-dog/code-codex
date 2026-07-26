import "./index.css";
import { Composition } from "remotion";
import { CodexLiveExplorerDemo } from "./Composition";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="CodexLiveExplorer90"
      component={CodexLiveExplorerDemo}
      durationInFrames={2700}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
