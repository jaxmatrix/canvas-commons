import {Audio, Video, makeScene2D} from '@canvas-commons/2d';
import {all, createRef, waitFor} from '@canvas-commons/core';

import exampleMp4 from '../../assets/example.mp4';

export default makeScene2D(function* (view) {
  const videoRef = createRef<Video>();
  const audioRef = createRef<Audio>();

  view.add(
    <>
      <Video ref={videoRef} src={exampleMp4} width={640} height={360} muted />
      <Audio ref={audioRef} src={exampleMp4} />
    </>,
  );

  yield videoRef();
  yield audioRef();
  yield* all(videoRef().play(), audioRef().play());
  yield* waitFor(4);
});
