importScripts('../tutorial/geometry.js','engine.js');
self.onmessage = function(event) {
  try {
    const {type,data,options,global,phi,offset,id}=event.data;
    const started=performance.now();
    const result=type==='candidate' ? ConcaveGeometry.cutCandidate(data,global,phi,offset,options.rounds) :
      ConcaveGeometry.search(data,options,progress=>self.postMessage({type:'progress',progress}));
    self.postMessage({type:'result',result,id,elapsedSeconds:(performance.now()-started)/1000});
  } catch(error) { self.postMessage({type:'error',message:error.message}); }
};
