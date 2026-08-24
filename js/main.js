function render(){
  if(activePlaybackTimer){ clearTimeout(activePlaybackTimer); activePlaybackTimer = null; }

  const container = document.getElementById('app');
  container.innerHTML = '';
  if(state.screen==='setup') renderSetup(container);
  else if(state.screen==='session') renderSession(container);
  else renderDone(container);

  if(state.screen==='session'){
    // Draws every operator→result connector line (connector-lines.js) after
    // the DOM has been built, since it measures real element positions.
    // No-op when state.showConnectors is false or there's no step yet.
    drawConnectorLines(currentItem());

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