import "./index.css";
import { Composition } from "remotion";
import { CodeCodexDemo } from "./Composition";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="CodeCodex90"
      component={CodeCodexDemo}
      durationInFrames={2700}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
