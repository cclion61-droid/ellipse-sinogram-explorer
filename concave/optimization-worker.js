importScripts('../tutorial/geometry.js','engine.js','optimization.js');
self.onmessage = event => {
  try {
    const start=performance.now();
    const result=CutOptimization.optimize(event.data.data,event.data.options||{},
      progress=>self.postMessage({type:'progress',progress}));
    self.postMessage({type:'result',result,elapsedSeconds:(performance.now()-start)/1000});
  } catch(error) { self.postMessage({type:'error',message:error.message}); }
};
