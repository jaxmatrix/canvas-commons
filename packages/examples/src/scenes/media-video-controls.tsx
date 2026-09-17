import {Audio, Video, makeScene2D} from '@canvas-commons/2d';
import {all, createRef} from '@canvas-commons/core';

import exampleMp4 from '../../assets/example.mp4';

export default makeScene2D(function* (view) {
  const videoRef = createRef<Video>();
  const audioRef = createRef<Audio>();

  view.add(
    <>
      <Video
        ref={videoRef}
        src={exampleMp4}
        width={960}
        height={540}
        muted
        frame={{x: 0, y: 0, width: 1, height: 1}}
        zoom={{x: 0.2, y: 0.1, width: 0.6, height: 0.8}}
        skipRegions={[{start: 1, end: 2}]}
        speedRegions={[{start: 2, end: 4, rate: 2}]}
      />
      <Audio
        ref={audioRef}
        src={exampleMp4}
        skipRegions={[{start: 1, end: 2}]}
        speedRegions={[{start: 2, end: 4, rate: 2}]}
      />
    </>,
  );

  yield* all(videoRef().play(), audioRef().play());
  yield* videoRef().scale(1.1, 2).to(1, 2);
});
