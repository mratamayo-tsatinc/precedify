function render(){
  if(activePlaybackTimer){ clearTimeout(activePlaybackTimer); activePlaybackTimer = null; }

  const container = document.getElementById('app');
  container.innerHTML = '';
  if(state.screen==='setup') renderSetup(container);
  else if(state.screen==='session') renderSession(container);
  else renderDone(container);

  if(state.screen==='session'){
    const item = currentItem();
    if(item && item.playback && item.playback.playing){
      const total = item.canonicalTrace.steps.length;
      if(item.playback.index < total){
        activePlaybackTimer = setTimeout(()=>{
          item.playback.index++;
          if(item.playback.index >= total) item.playback.playing = false;
          render();
        }, 1000);
      } else {
        item.playback.playing = false;
      }
    }
  }
}

render();
