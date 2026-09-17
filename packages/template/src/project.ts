import {makeProject} from '@canvas-commons/core';

import example from './scenes/example?scene';
import media from './scenes/media?scene';

export default makeProject({
  experimentalFeatures: true,
  scenes: [example, media],
});
